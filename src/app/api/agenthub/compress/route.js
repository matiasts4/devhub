import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { getCopilotToken } from '@/lib/copilot-token';
import { getDb } from '@/lib/db/localDb';
import { withAuth } from '@/lib/swarm/withAuth.js';
import {
  buildCompressionStats,
  estimateMessageTokens,
  normalizeKeepLastN,
  planMessageCompression,
} from '@/lib/agenthubCompression';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

async function loadConfig() {
  const CONFIG_PATH = path.join(process.cwd(), 'data', 'llm-providers-config.json');
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { priorityOrder: ['copilot'], providers: {} };
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/agenthub/compress
//
// Compresses old messages in a session into a single summary message.
// Keeps the last `keep_last_n` messages intact to preserve recent context.
//
// Body: { session_id, project_id?, model?, keep_last_n? }
// Returns: { compressed: true, messages_before, messages_after, tokens_before, tokens_after }
// ──────────────────────────────────────────────────────────────
export const POST = withAuth(async function POST(req) {
  try {
    const body = await req.json();
    const { session_id, model: modelOverride } = body;
    const keepLastN = normalizeKeepLastN(body.keep_last_n);

    if (!session_id) {
      return NextResponse.json({ error: 'session_id es requerido' }, { status: 400 });
    }

    const db = getDb();

    // Fetch all messages for the session ordered by created_at
    const allMessages = db
      .prepare(
        `SELECT id, role, content, created_at
         FROM agent_hub_messages
         WHERE session_id = ?
         ORDER BY created_at ASC`
      )
      .all(session_id);

    const compressionPlan = planMessageCompression(allMessages, keepLastN);
    if (!compressionPlan.canCompress) {
      return NextResponse.json(
        {
          compressed: false,
          reason: compressionPlan.reason,
          keep_last_n: compressionPlan.keep_last_n,
          messages_before: compressionPlan.messages_before,
          messages_after: compressionPlan.messages_after,
          messages_compressed: 0,
          tokens_before: compressionPlan.tokens_before,
          tokens_after: compressionPlan.tokens_after,
          tokens_saved: compressionPlan.tokens_saved,
          token_reduction_ratio: compressionPlan.token_reduction_ratio,
          message_reduction_ratio: compressionPlan.message_reduction_ratio,
        },
        { status: 200 }
      );
    }

    const { toCompress, keptMessages } = compressionPlan;
    const tokensBefore = compressionPlan.tokens_before;

    // ── Build LLM client ──────────────────────────────────────
    const config = await loadConfig();
    let apiKey = null;
    let baseURL = null;
    let model = modelOverride || 'gpt-4o-mini';

    for (const p of config.priorityOrder || []) {
      const pConfig = config.providers?.[p];
      if (!pConfig) continue;

      if (p === 'openrouter' && pConfig.OPENROUTER_API_KEY) {
        apiKey = pConfig.OPENROUTER_API_KEY;
        baseURL = 'https://openrouter.ai/api/v1';
        model = modelOverride || pConfig.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct';
        break;
      }
      if (p === 'copilot' && pConfig.COPILOT_OAUTH_TOKEN) {
        try {
          apiKey = await getCopilotToken(pConfig.COPILOT_OAUTH_TOKEN);
          baseURL = 'https://api.githubcopilot.com';
          model = modelOverride || 'gpt-4o-mini';
        } catch {
          continue;
        }
        break;
      }
      if (p === 'direct' && pConfig.LLM_BASE_URL) {
        apiKey = pConfig.LLM_API_KEY || 'dummy';
        baseURL = pConfig.LLM_BASE_URL;
        model = modelOverride || pConfig.LLM_MODEL || 'gpt-4o-mini';
        break;
      }
    }

    if (!apiKey || !baseURL) {
      return NextResponse.json(
        { error: 'No hay proveedor LLM configurado para comprimir' },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey, baseURL });

    // ── Build compression prompt ──────────────────────────────
    const conversationText = toCompress
      .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join('\n\n');

    const compressionPrompt = `Sos un asistente que resume conversaciones técnicas.
Resume la siguiente conversación en un párrafo conciso (máximo 300 palabras).
Preservá: decisiones técnicas, nombres de archivos/funciones mencionados, errores encontrados, y el contexto clave.
NO incluyas saludos, preguntas triviales ni contenido redundante.
Escribí el resumen en primera persona del asistente (como si fuera el asistente recordando la conversación previa).

CONVERSACIÓN A RESUMIR:
${conversationText}

RESUMEN:`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: compressionPrompt }],
      temperature: 0.3,
      max_tokens: 600,
    });

    const summaryContent = completion.choices?.[0]?.message?.content?.trim();
    if (!summaryContent) {
      return NextResponse.json({ error: 'El LLM no devolvió un resumen válido' }, { status: 500 });
    }

    // ── Atomically replace compressed messages in DB ──────────
    const idsToDelete = toCompress.map((m) => m.id);
    const firstCompressedMessage = toCompress[0];
    const firstKeptMessage = keptMessages[0];
    const summaryTimestamp = firstKeptMessage
      ? new Date(new Date(firstKeptMessage.created_at).getTime() - 1000).toISOString()
      : firstCompressedMessage?.created_at || new Date().toISOString();
    const summaryId = `compressed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const summaryBody = `[Resumen de historial comprimido]\n\n${summaryContent}`;
    const summaryMeta = {
      compressed: true,
      compression_type: 'history_summary',
      summary_source: '/api/agenthub/compress',
      model_used: model,
      messages_compressed: idsToDelete.length,
      keep_last_n: compressionPlan.keep_last_n,
      compressed_range: {
        first_message_id: firstCompressedMessage?.id || null,
        last_message_id: toCompress[toCompress.length - 1]?.id || null,
      },
      created_at: summaryTimestamp,
    };

    // Use a transaction: delete old messages, insert summary
    const replaceCompressed = db.transaction(() => {
      // Delete old messages
      const placeholders = idsToDelete.map(() => '?').join(', ');
      db.prepare(`DELETE FROM agent_hub_messages WHERE id IN (${placeholders})`).run(
        ...idsToDelete
      );

      db.prepare(
        `INSERT INTO agent_hub_messages (id, session_id, role, content, meta, source, created_at)
          VALUES (?, ?, 'assistant', ?, ?, 'compress', ?)`
      ).run(summaryId, session_id, summaryBody, JSON.stringify(summaryMeta), summaryTimestamp);
    });

    replaceCompressed();

    // ── Calculate post-compression token estimate ─────────────
    const remainingMessages = db
      .prepare(
        `SELECT content FROM agent_hub_messages WHERE session_id = ? ORDER BY created_at ASC`
      )
      .all(session_id);

    const tokensAfter = remainingMessages.reduce(
      (sum, message) => sum + estimateMessageTokens(message.content),
      0
    );
    const finalStats = buildCompressionStats({
      beforeMessages: allMessages,
      afterMessages: remainingMessages,
      beforeTokens: tokensBefore,
      afterTokens: tokensAfter,
    });

    return NextResponse.json({
      compressed: true,
      keep_last_n: compressionPlan.keep_last_n,
      messages_compressed: idsToDelete.length,
      summary_message_id: summaryId,
      ...finalStats,
      model_used: model,
    });
  } catch (err) {
    console.error('[compress] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
});
