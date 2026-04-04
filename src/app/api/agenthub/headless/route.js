import { NextResponse } from 'next/server';
import {
  tables,
  upsertTrace,
  getDb,
  getSwarmConfig,
  getActiveAgentCount,
} from '@/lib/db/localDb.js';
import processManager from '@/lib/swarm/processManager';
import swarmQueue from '@/lib/swarm/queue';

// Force Node.js runtime — required for background promises after response
export const runtime = 'nodejs';

const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4153;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

// Feature flag — when false, falls back to TransformStream behavior
const BG_PERSIST_ENABLED = process.env.AGENTHUB_BG_PERSIST !== 'false';

async function checkHealth() {
  try {
    const res = await fetch(`${SERVER_URL}/global/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer(_cwd) {
  if (await checkHealth()) return true;
  return processManager.ensureServer(_cwd);
}

/**
 * Background SSE consumer: reads OpenCode events, persists traces via upsert.
 * Terminates on session.idle, session.error, or idle timeout.
 */
async function consumeSSE(sessionID, messageID, _projectID, _cwd) {
  const timeoutMs = parseInt(process.env.AGENTHUB_SSE_TIMEOUT || '300000', 10); // 5min default
  let idleTimer = null;

  try {
    // Connection timeout only — once connected, the idle timer manages stream lifetime
    const connectCtrl = new AbortController();
    const connectTimeout = setTimeout(() => connectCtrl.abort(), 60000);
    const streamRes = await fetch(`${SERVER_URL}/event`, {
      signal: connectCtrl.signal,
    });
    clearTimeout(connectTimeout);
    if (!streamRes.ok || !streamRes.body) {
      console.error(`[bg-consumer] Failed to connect to SSE for session ${sessionID}`);
      return;
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        console.warn(`[bg-consumer] Idle timeout (${timeoutMs}ms) for session ${sessionID}`);
        reader.cancel().catch(() => {});
      }, timeoutMs);
    };

    resetIdleTimer();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        resetIdleTimer();

        let event;
        try {
          event = JSON.parse(raw);
        } catch {
          continue; // malformed event, skip
        }

        const props = event.properties || {};
        const evType = event.type || '';

        // ── Session filtering: only process events for our session ──
        // The /event endpoint is global — we must filter by session_id
        // Reject events that lack a session_id entirely to prevent cross-contamination
        const eventSessionId = props.session_id || props.sessionId || event.session_id;
        if (!eventSessionId || eventSessionId !== sessionID) continue;

        // ── Trace persistence ──
        try {
          if (evType === 'message.part.updated' && props.part?.type === 'tool') {
            const p = props.part;
            upsertTrace({
              id: crypto.randomUUID(),
              session_id: sessionID,
              message_id: messageID || null,
              part_id: p.callID || p.id || crypto.randomUUID(),
              trace_type: 'tool',
              agent_name: null,
              tool_name: p.tool,
              tool_input: p.state?.input,
              tool_output: p.state?.output ?? undefined,
              tool_status: p.state?.status,
              content: p.state?.title ?? p.tool,
              time_start: p.state?.time?.start,
              time_end: p.state?.time?.end,
            });
          } else if (evType === 'message.part.updated' && props.part?.type === 'reasoning') {
            const p = props.part;
            upsertTrace({
              id: p.id,
              session_id: sessionID,
              message_id: messageID || null,
              part_id: p.id,
              trace_type: 'reasoning',
              content: p.text || '',
              time_start: p.state?.time?.start,
              time_end: p.state?.time?.end,
            });
          } else if (evType === 'message.part.updated' && props.part?.type === 'subtask') {
            const p = props.part;
            upsertTrace({
              id: p.id,
              session_id: sessionID,
              message_id: messageID || null,
              part_id: p.id,
              trace_type: 'subtask',
              agent_name: p.agent,
              content: p.prompt?.slice(0, 120),
              time_start: p.state?.time?.start,
              time_end: p.state?.time?.end,
            });
          } else if (evType === 'message.part.updated' && props.part?.type === 'text') {
            const p = props.part;
            upsertTrace({
              id: p.id,
              session_id: sessionID,
              message_id: messageID || null,
              part_id: p.id,
              trace_type: 'text',
              content: p.text || '',
              time_start: p.state?.time?.start,
              time_end: p.state?.time?.end,
            });
          } else if (evType === 'message.part.delta' && props.field === 'text') {
            // Delta — append to existing text part if possible
            // For simplicity, we insert a delta part (the upsert key prevents duplicates)
            // In practice, the final text part from part.updated will overwrite this
            if (props.delta) {
              const deltaKey = `delta-${sessionID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              upsertTrace({
                id: deltaKey,
                session_id: sessionID,
                message_id: messageID || null,
                part_id: deltaKey,
                trace_type: 'text',
                content: props.delta,
              });
            }
          } else if (evType === 'text.delta' || evType === 'message.assistant') {
            const txt = props.text || props.delta || props.content || '';
            if (txt) {
              const legacyKey = `legacy-${sessionID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              upsertTrace({
                id: legacyKey,
                session_id: sessionID,
                message_id: messageID || null,
                part_id: legacyKey,
                trace_type: 'text',
                content: txt,
              });
            }
          }
        } catch (traceErr) {
          // Single trace failure must not terminate the consumer
          console.error(
            `[bg-consumer] Error persisting trace for session ${sessionID}:`,
            traceErr.message
          );
        }
      }
    }

    if (idleTimer) clearTimeout(idleTimer);
  } catch (err) {
    console.error(`[bg-consumer] SSE consumer error for session ${sessionID}:`, err.message);
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    processManager.untrackSession(sessionID);
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      agent,
      prompt,
      directory,
      session_id: providedSessionId,
      subagentMsgId,
      project_id,
    } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Falta parámetro (prompt)' }, { status: 400 });
    }

    // Feature flag: when disabled, fall back to TransformStream behavior
    if (!BG_PERSIST_ENABLED) {
      return NextResponse.json(
        { error: 'Background persistence is disabled via AGENTHUB_BG_PERSIST' },
        { status: 501 }
      );
    }

    const cwd = directory || process.cwd();

    // Concurrency enforcement
    const config = getSwarmConfig();
    const maxConcurrent = parseInt(config.max_concurrent, 10) || 5;
    const activeCount = getActiveAgentCount();

    if (activeCount >= maxConcurrent) {
      // Enqueue the request
      const queueId = `headless-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const queuePosition = swarmQueue.getQueueLength() + 1;
      const estimatedWaitMs = swarmQueue.getEstimatedWait(queuePosition);

      return NextResponse.json(
        {
          error: `Límite de concurrencia alcanzado (${activeCount}/${maxConcurrent}). Tu solicitud fue encolada.`,
          activeCount,
          maxConcurrent,
          queued: true,
          queuePosition,
          estimatedWaitMs,
        },
        { status: 429 }
      );
    }

    // 1. Ensure OpenCode is running
    const isRunning = await ensureServer(cwd);
    if (!isRunning) {
      return NextResponse.json(
        { error: 'No se pudo inicializar OpenCode Headless' },
        { status: 503 }
      );
    }

    let sessionID;

    // 2. Reuse existing session or create new one
    if (providedSessionId) {
      sessionID = providedSessionId;
    } else {
      const createRes = await fetch(`${SERVER_URL}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: cwd }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        return NextResponse.json({ error: `Fallo al crear sesión: ${err}` }, { status: 500 });
      }

      const created = await createRes.json();
      sessionID = created.id;
    }

    // Track session in ProcessManager
    processManager.trackSession(sessionID, {
      agent: agent || 'default',
      project: project_id || 'default',
      directory: cwd,
    });

    // 3. Send the prompt (Fire & Forget) with timeout
    const messageBody = agent
      ? { agent, parts: [{ type: 'text', text: prompt }] }
      : { parts: [{ type: 'text', text: prompt }] };

    const msgAbort = AbortSignal.timeout(30000);
    fetch(`${SERVER_URL}/session/${sessionID}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messageBody),
      signal: msgAbort,
    }).catch((e) => console.error('[bg-consumer] Error sending prompt to OpenCode:', e.message));

    // 4. Persist session metadata in local DB
    // Use sessionID as local DB id to maintain consistent linkage across systems
    // Use upsert pattern: insert new or update status to 'active' on reuse
    try {
      tables.agent_hub_sessions.insert({
        id: sessionID,
        project_id: project_id || 'default',
        title: prompt.slice(0, 80) + (prompt.length > 80 ? '...' : ''),
        agent_model: agent || 'default',
        directory: cwd,
        opencode_session_id: sessionID,
        status: 'active',
      });
    } catch (dbErr) {
      // Session already exists (reuse case) — update status to active
      if (dbErr.message.includes('UNIQUE') || dbErr.message.includes('PRIMARY KEY')) {
        try {
          getDb()
            .prepare(
              `UPDATE agent_hub_sessions SET status = 'active', updated_at = datetime('now') WHERE id = ?`
            )
            .run(sessionID);
        } catch (updateErr) {
          console.warn('[bg-consumer] Failed to update session status:', updateErr.message);
        }
      } else {
        console.warn('[bg-consumer] Session metadata insert error:', dbErr.message);
      }
    }

    // 5. Generate message ID for frontend linkage (use provided subagentMsgId or create one)
    const messageID = subagentMsgId || crypto.randomUUID();

    // 6. Start fire-and-forget background SSE consumer
    consumeSSE(sessionID, messageID, project_id, cwd).catch((err) => {
      console.error('[bg-consumer] Unhandled error:', err.message);
    });

    // 7. Return JSON immediately — consumer runs in background
    return NextResponse.json({
      success: true,
      sessionID,
      messageID,
    });
  } catch (err) {
    console.error('Error en Headless Proxy', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
