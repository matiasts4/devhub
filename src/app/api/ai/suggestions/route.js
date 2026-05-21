import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/localDb';
import { buildLocalSuggestions } from '@/lib/suggestions/rules';
import { buildSystemPrompt, parseJsonFromText, accumulateChunks } from './helpers';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3400';

/**
 * POST /api/ai/suggestions
 *
 * Body: { project_id: string, mode: "auto" | "prompt", prompt?: string }
 * Response: { suggestions: Suggestion[], source: "rules" | "llm" | "hybrid" }
 */
export async function POST(request) {
  try {
    const { project_id, mode = 'auto', prompt } = await request.json();

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    // ── Load data from DB ────────────────────────────────────────────────
    const db = getDb();

    const project = db
      .prepare('SELECT id, name, progress, description, status FROM projects WHERE id = ?')
      .get(project_id);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ?').all(project_id);
    const milestones = db
      .prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY due_date ASC')
      .all(project_id);

    // ── Fast path: auto mode with < 2 tasks → return rules only ─────────
    if (mode === 'auto' && tasks.length < 2) {
      const suggestions = buildLocalSuggestions(project, tasks, milestones);
      return NextResponse.json({ suggestions, source: 'rules' });
    }

    // ── Build system prompt ───────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(project, tasks, milestones, prompt);

    // ── Call agenthub/chat (LLM bridge) ───────────────────────────────────
    let llmSuggestions = null;
    let llmCallSucceeded = false;

    try {
      const chatResponse = await fetch(`${BASE_URL}/api/agenthub/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: systemPrompt }],
          project_id,
          projectName: project.name,
        }),
        // Don't follow redirects, timeout at 30s
        signal: AbortSignal.timeout(30000),
      });

      if (chatResponse.ok) {
        // agenthub/chat returns NDJSON streaming — read it fully
        const rawText = await chatResponse.text();
        const lines = rawText.split('\n').filter((l) => l.trim());
        const accumulated = accumulateChunks(lines);
        llmSuggestions = parseJsonFromText(accumulated);
        if (llmSuggestions) llmCallSucceeded = true;
      } else {
        // Non-OK response from agenthub/chat — detect "no provider" errors
        const errBody = await chatResponse.text().catch(() => '');
        const isNoProvider =
          chatResponse.status === 400 ||
          chatResponse.status === 503 ||
          /proveedor|provider|no.*llm|llm.*not/i.test(errBody);
        if (isNoProvider) {
          const localSuggestions = buildLocalSuggestions(project, tasks, milestones);
          return NextResponse.json({
            suggestions: localSuggestions,
            source: 'rules',
            no_llm: true,
          });
        }
        console.warn('[suggestions] agenthub/chat returned non-OK status:', chatResponse.status);
      }
    } catch (fetchErr) {
      // LLM not configured or network error — fall through to rules
      console.warn('[suggestions] LLM call failed, falling back to rules:', fetchErr.message);
    }

    // ── Determine response ────────────────────────────────────────────────
    if (llmCallSucceeded && llmSuggestions && llmSuggestions.length > 0) {
      return NextResponse.json({ suggestions: llmSuggestions.slice(0, 5), source: 'llm' });
    }

    // Fallback: return local rules
    const localSuggestions = buildLocalSuggestions(project, tasks, milestones);
    return NextResponse.json({ suggestions: localSuggestions, source: 'rules' });
  } catch (err) {
    console.error('[suggestions route] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
