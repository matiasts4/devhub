import { NextResponse } from 'next/server';
import {
  tables,
  upsertTrace,
  getDb,
  getSwarmConfig,
  getActiveAgentCount,
  updateSessionStatus,
  updateSessionError,
} from '@/lib/db/localDb.js';
import processManager from '@/lib/swarm/processManager';
import swarmQueue from '@/lib/swarm/queue';
import { AuditTrail } from '../../../../../lib/audit-trail.js';
import { withAuth } from '@/lib/swarm/withAuth.js';

// Force Node.js runtime — required for background promises after response
export const runtime = 'nodejs';

const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4154;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

function getEventSessionId(event = {}, props = {}) {
  return (
    props.session_id ||
    props.sessionId ||
    props.sessionID ||
    props?.info?.sessionID ||
    event.session_id ||
    event.sessionID ||
    null
  );
}

function getTerminalSessionStatus(eventType, props = {}) {
  if (eventType === 'session.aborted') return 'aborted';
  if (eventType === 'session.error' || eventType === 'error') return 'error';
  if (eventType === 'session.idle') return 'completed';

  if (eventType === 'session.status') {
    const statusType = props.status?.type || props.status;
    if (statusType === 'idle') return 'completed';
    if (statusType === 'aborted') return 'aborted';
    if (statusType === 'error') return 'error';
  }

  return null;
}

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
  return processManager.ensure(_cwd);
}

/**
 * Background SSE consumer: reads OpenCode events, persists traces via upsert.
 * Terminates on session.idle, session.error, or idle timeout.
 */
async function consumeSSE(sessionID, messageID, _projectID, _cwd, auditTrail) {
  const timeoutMs = parseInt(process.env.AGENTHUB_SSE_TIMEOUT || '300000', 10); // 5min default
  let idleTimer = null;
  let eventCount = 0;
  let traceCount = 0;
  let lastTracePersistedCheckpoint = 0;
  let finalStatus = null;
  let lastErrorMsg = null; // captures OpenCode error for UI display
  let reader = null;

  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const finishStream = async (status) => {
    if (finalStatus) return;
    finalStatus = status;
    clearIdleTimer();

    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancellation errors — the stream is already shutting down.
      }
    }
  };

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
      auditTrail?.record('sse_failed', { status: streamRes?.status });
      return;
    }

    auditTrail?.record('sse_connected');

    reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const resetIdleTimer = () => {
      clearIdleTimer();
      idleTimer = setTimeout(() => {
        console.warn(`[bg-consumer] Idle timeout (${timeoutMs}ms) for session ${sessionID}`);
        auditTrail?.record('session_idle', {
          reason: 'timeout',
          duration: timeoutMs,
          status: traceCount > 0 ? 'completed' : 'aborted',
        });
        void finishStream(traceCount > 0 ? 'completed' : 'aborted');
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

        let event;
        try {
          event = JSON.parse(raw);
        } catch {
          continue; // malformed event, skip
        }

        const props = event.properties || {};
        const evType = event.type || '';

        // ── Session filtering: only process events for our session ──
        // The /event endpoint is global — we must filter by session identifier.
        // OpenCode events may use different keys depending on event type/version.
        const eventSessionId = getEventSessionId(event, props);
        if (!eventSessionId || eventSessionId !== sessionID) continue;

        eventCount++;

        const terminalStatus = getTerminalSessionStatus(evType, props);
        if (terminalStatus) {
          if (terminalStatus === 'completed') {
            auditTrail?.record('session_idle', {
              eventsProcessed: eventCount,
              tracesPersisted: traceCount,
              source: evType,
            });
          } else if (terminalStatus === 'aborted') {
            auditTrail?.record('session_aborted', {
              eventsProcessed: eventCount,
              tracesPersisted: traceCount,
            });
          } else {
            // 'error' terminal status — capture the message for UI display
            lastErrorMsg = props.error || props.message || props.reason || 'OpenCode session error';
            auditTrail?.record('session_error', {
              error: lastErrorMsg,
            });
          }

          await finishStream(terminalStatus);
          return;
        }

        resetIdleTimer();

        // ── Audit recording ──
        if (evType === 'message.part.updated' && props.part?.type === 'tool') {
          const p = props.part;
          auditTrail?.record('tool_call', {
            tool: p.tool,
            file: p.state?.input?.path || p.state?.title,
            status: p.state?.status,
          });
        } else if (evType === 'message.part.updated' && props.part?.type === 'text') {
          const p = props.part;
          auditTrail?.record('text_response', {
            text: p.text?.slice(0, 200),
          });
        } else if (evType === 'message.part.updated' && props.part?.type === 'reasoning') {
          auditTrail?.record('reasoning');
        } else if (evType === 'message.part.updated' && props.part?.type === 'subtask') {
          const p = props.part;
          auditTrail?.record('subtask_start', {
            agent: p.agent,
            prompt: p.prompt?.slice(0, 100),
          });
        } else if (evType === 'session.idle') {
          auditTrail?.record('session_idle', {
            eventsProcessed: eventCount,
            tracesPersisted: traceCount,
          });
        } else if (evType === 'session.error') {
          lastErrorMsg = props.error || props.message || props.reason || 'OpenCode session error';
          auditTrail?.record('session_error', {
            error: lastErrorMsg,
          });
        } else if (evType === 'session.waiting') {
          auditTrail?.record('session_waiting');
        }

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
            traceCount++;
            auditTrail?.record('tool_complete', {
              tool: p.tool,
              status: p.state?.status,
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
            traceCount++;
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
            traceCount++;
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
            traceCount++;
          } else if (evType === 'message.part.delta' && props.field === 'text') {
            // Ignore deltas to avoid massive trace amplification.
            // Final consolidated text is persisted via message.part.updated.
          } else if (evType === 'text.delta' || evType === 'message.assistant') {
            const txt = props.text || props.delta || props.content || '';
            if (txt) {
              // Legacy stream variants are intentionally ignored for persistence.
              // We rely on message.part.updated for stable final text snapshots.
            }
          }

          // Periodically persist audit trail (once per checkpoint)
          if (
            traceCount > 0 &&
            traceCount % 10 === 0 &&
            traceCount !== lastTracePersistedCheckpoint
          ) {
            auditTrail?.record('trace_persisted', { count: traceCount });
            lastTracePersistedCheckpoint = traceCount;
          }
        } catch (traceErr) {
          // Single trace failure must not terminate the consumer
          console.error(
            `[bg-consumer] Error persisting trace for session ${sessionID}:`,
            traceErr.message
          );
          auditTrail?.record('trace_error', { error: traceErr.message });
        }
      }
    }

    clearIdleTimer();
    auditTrail?.record('sse_disconnected', {
      eventsProcessed: eventCount,
      tracesPersisted: traceCount,
    });

    // Print audit report at the end of the session
    if (auditTrail) {
      console.log(auditTrail.generateReport());
    }
  } catch (err) {
    lastErrorMsg = err.message;
    console.error(`[bg-consumer] SSE consumer error for session ${sessionID}:`, err.message);
    auditTrail?.record('error', { message: err.message });

    // Print audit report even on error
    if (auditTrail) {
      console.log(auditTrail.generateReport());
    }
  } finally {
    clearIdleTimer();

    // Mark session as completed/error when background consumer ends.
    // This prevents stale "active" sessions from blocking concurrency slots.
    try {
      const statusToPersist = finalStatus || (traceCount > 0 ? 'completed' : 'aborted');
      if (statusToPersist === 'error' && lastErrorMsg) {
        updateSessionError(sessionID, lastErrorMsg);
      } else {
        updateSessionStatus(sessionID, statusToPersist);
      }
      auditTrail?.record('session_finished', { status: statusToPersist, traces: traceCount });
    } catch {
      // ignore status update errors
    }

    processManager.untrackSession(sessionID);
  }
}
export const POST = withAuth(async function POST(req) {
  try {
    const body = await req.json();
    const {
      agent,
      prompt,
      directory,
      session_id: providedSessionId,
      subagentMsgId,
      project_id,
      model: modelHint,
    } = body;

    // Resolve model to OpenCode providerID/modelID — only when explicitly provided.
    // If no model hint, let the agent use its own configured model from opencode.json.
    // Format accepted: 'providerID/modelID' (required slash) or fallback env var.
    const rawModel = modelHint || process.env.OPENCODE_HEADLESS_MODEL || null;
    const slashIdx = rawModel ? rawModel.indexOf('/') : -1;
    const resolvedModel = rawModel
      ? slashIdx !== -1
        ? { providerID: rawModel.slice(0, slashIdx), modelID: rawModel.slice(slashIdx + 1) }
        : null // model without provider prefix is ambiguous — skip override
      : null;

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

    // Create audit trail for this session
    const auditTrail = new AuditTrail(`headless-${Date.now()}`, {
      prompt,
      agent: agent || 'default',
      project_id: project_id || 'default',
      directory: cwd,
    });

    // Concurrency enforcement
    const config = getSwarmConfig();
    const maxConcurrent = parseInt(config.max_concurrent, 10) || 5;
    const activeCount = getActiveAgentCount();

    if (activeCount >= maxConcurrent) {
      // Enqueue the request
      const queuePosition = swarmQueue.getQueueLength() + 1;
      const estimatedWaitMs = swarmQueue.getEstimatedWait(queuePosition);

      auditTrail.record('queued', { queuePosition, estimatedWaitMs });

      return NextResponse.json(
        {
          error: `Límite de concurrencia alcanzado (${activeCount}/${maxConcurrent}). Tu solicitud fue encolada.`,
          activeCount,
          maxConcurrent,
          queued: true,
          queuePosition,
          estimatedWaitMs,
          auditTrailId: auditTrail.sessionID,
        },
        { status: 429 }
      );
    }

    // 1. Ensure OpenCode is running
    auditTrail.record('server_check');
    let isRunning = false;
    try {
      isRunning = await ensureServer(cwd);
    } catch (ensureErr) {
      const reason =
        ensureErr?.message || processManager.lastSpawnError || 'Could not start OpenCode';
      auditTrail.record('server_failed', { error: reason });
      console.error('[headless] ensureServer failed:', reason);
      console.log(auditTrail.generateReport());
      return NextResponse.json(
        {
          error: 'No se pudo inicializar OpenCode Headless',
          detail: reason,
          auditTrailId: auditTrail.sessionID,
        },
        { status: 503 }
      );
    }

    if (!isRunning) {
      const reason = processManager.lastSpawnError || 'Could not start OpenCode';
      auditTrail.record('server_failed', { error: reason });
      console.log(auditTrail.generateReport());
      return NextResponse.json(
        {
          error: 'No se pudo inicializar OpenCode Headless',
          detail: reason,
          auditTrailId: auditTrail.sessionID,
        },
        { status: 503 }
      );
    }
    auditTrail.record('server_ready', { port: SERVER_PORT });

    let sessionID;

    // 2. Reuse existing session or create new one
    if (providedSessionId) {
      sessionID = providedSessionId;
      auditTrail.record('session_reused', { sessionID });
    } else {
      const createRes = await fetch(`${SERVER_URL}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: cwd }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        auditTrail.record('session_create_failed', { error: err });
        console.log(auditTrail.generateReport());
        return NextResponse.json(
          {
            error: `Fallo al crear sesión: ${err}`,
            auditTrailId: auditTrail.sessionID,
          },
          { status: 500 }
        );
      }

      const created = await createRes.json();
      sessionID = created.id;
      auditTrail.record('session_create', { sessionID });
    }

    // Track session in ProcessManager
    processManager.trackSession(sessionID, {
      agent: agent || 'default',
      project: project_id || 'default',
      directory: cwd,
    });

    // 3. Generate message ID for frontend linkage (use provided subagentMsgId or create one)
    const messageID = subagentMsgId || crypto.randomUUID();

    // 4. Send the prompt (Fire & Forget) with optional timeout
    // model is only included when explicitly provided — agents use their opencode.json config otherwise
    const messageBody = {
      ...(agent ? { agent } : {}),
      ...(resolvedModel ? { model: resolvedModel } : {}),
      parts: [{ type: 'text', text: prompt }],
    };

    const normalizedBody = {
      ...messageBody,
      id: messageID,
    };

    auditTrail.record('model_resolved', {
      raw: rawModel || 'agent-default',
      ...(resolvedModel || {}),
    });

    auditTrail.record('prompt_sent', { length: prompt.length, agent: agent || 'default' });

    const msgTimeoutMs = parseInt(process.env.AGENTHUB_MESSAGE_TIMEOUT || '0', 10);
    const messageFetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedBody),
    };
    if (msgTimeoutMs > 0) {
      messageFetchOptions.signal = AbortSignal.timeout(msgTimeoutMs);
    }

    // Fire-and-forget the message to OpenCode.
    // Check res.ok so HTTP errors (e.g. ProviderModelNotFoundError) are captured and surfaced in the UI.
    fetch(`${SERVER_URL}/session/${sessionID}/message`, messageFetchOptions)
      .then(async (res) => {
        if (!res.ok) {
          let errMsg;
          try {
            const body = await res.json();
            errMsg = body.error || body.message || `HTTP ${res.status} from OpenCode`;
          } catch {
            errMsg = `HTTP ${res.status} from OpenCode`;
          }
          console.error('[bg-consumer] OpenCode rejected message:', errMsg);
          auditTrail?.record('prompt_rejected', { status: res.status, error: errMsg });
          updateSessionError(sessionID, errMsg);
        }
      })
      .catch((e) => {
        console.error('[bg-consumer] Error sending prompt to OpenCode:', e.message);
        auditTrail?.record('prompt_send_error', {
          error: e.message,
          timeoutMs: msgTimeoutMs > 0 ? msgTimeoutMs : null,
        });
        updateSessionError(sessionID, e.message);
      });

    // 5. Persist session metadata in local DB
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

    // 6. Start fire-and-forget background SSE consumer
    consumeSSE(sessionID, messageID, project_id, cwd, auditTrail).catch((err) => {
      console.error('[bg-consumer] Unhandled error:', err.message);
      auditTrail?.record('consumer_error', { error: err.message });
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
});
