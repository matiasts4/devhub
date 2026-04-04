/**
 * OpenCode runner service — Headless API Integration.
 *
 * Phases 1-5:
 *   Phase 1: Server lifecycle management (spawn, health-check, graceful shutdown)
 *   Phase 2: SSE event stream parsing with correct OpenCode event format
 *   Phase 3: Approval/rejection flow via /:sessionID/permissions/:permissionID
 *   Phase 4: Session state machine (idle → busy → idle/done)
 *   Phase 5: Traceability & analytics — log all events to SQLite agent_logs
 */

const { spawn } = require('child_process');
const logger = require('../utils/logger');
const EventEmitter = require('events');
const { logAgentEvent } = require('./activityLogger');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVER_PORT = 4153;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const SERVER_READY_TIMEOUT = 15_000; // 15s max wait for server startup
const SSE_RECONNECT_DELAY = 1_000;

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let serverProcess = null;
let serverReady = false;

let serverLaunchPromise = null;

/**
 * Check if the OpenCode server is already running (shared with Next.js).
 * Uses the HTTP status endpoint to detect existing processes.
 *
 * @returns {Promise<boolean>}
 */
async function isServerRunning() {
  try {
    const res = await fetch(`${SERVER_URL}/global/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure the OpenCode headless server is running.
 * Spawns `opencode serve` if not already running, waits until healthy.
 * First checks if server is already running (shared with Next.js/bot).
 *
 * @param {string} cwd - Project working directory
 * @returns {Promise<void>}
 */
async function ensureServer(cwd) {
  // Check if already running (possibly from Next.js or previous bot instance)
  if (await isServerRunning()) {
    if (!serverReady) {
      serverReady = true;
      logger.info('OpenCode Headless ya estaba corriendo (adoptado)');
    }
    return;
  }

  if (serverProcess && serverReady) return;
  if (serverLaunchPromise) return serverLaunchPromise;

  serverLaunchPromise = (async () => {
    logger.info('Iniciando servidor headless de OpenCode...');

    serverProcess = spawn('opencode', ['serve', '--port', String(SERVER_PORT)], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // Collect stderr for debugging
    serverProcess.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) logger.debug(`[opencode stderr] ${msg}`);
    });

    serverProcess.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('listening on') || msg.includes('Server running')) {
        if (!serverReady) {
          serverReady = true;
          logger.info(`OpenCode Headless listo en puerto ${SERVER_PORT}`);
        }
      }
    });

    serverProcess.on('error', (err) => {
      logger.error(`OpenCode server spawn error: ${err.message}`);
      serverProcess = null;
      serverReady = false;
    });

    serverProcess.on('exit', (code, signal) => {
      logger.warn(`OpenCode server exited (code=${code}, signal=${signal})`);
      serverProcess = null;
      serverReady = false;
    });

    // Wait for readiness with timeout
    const started = Date.now();
    while (!serverReady) {
      if (Date.now() - started > SERVER_READY_TIMEOUT) {
        // Fallback: try health endpoint directly
        try {
          const res = await fetch(`${SERVER_URL}/global/health`);
          if (res.ok) {
            serverReady = true;
            logger.info(`OpenCode Headless listo (health check) en puerto ${SERVER_PORT}`);
            return;
          }
        } catch {
          // Not ready yet
        }
        logger.warn('OpenCode server no respondió en el timeout, intentando continuar...');
        serverReady = true; // optimistic
        return;
      }
      await sleep(200);
    }
  })();

  await serverLaunchPromise;
  serverLaunchPromise = null;
}

/**
 * Gracefully shut down the OpenCode server.
 * Only shuts down if we spawned it, not if it's shared.
 */
async function shutdownServer() {
  // If we didn't spawn it, don't kill it (it's shared with Next.js)
  if (!serverProcess) {
    logger.debug('OpenCode not spawned by bot, skipping shutdown');
    return;
  }

  try {
    // Try graceful dispose via API first
    await fetch(`${SERVER_URL}/global/dispose`, { method: 'POST' }).catch(() => {});
  } catch {
    // API might already be down
  }

  serverProcess.kill('SIGTERM');

  // Wait for exit
  await new Promise((resolve) => {
    serverProcess.on('exit', resolve);
    setTimeout(resolve, 3000); // Force timeout
  });

  serverProcess = null;
  serverReady = false;
  logger.info('OpenCode Headless apagado');
}

// ---------------------------------------------------------------------------
// SSE Parser — correct OpenCode event format
// ---------------------------------------------------------------------------

/**
 * Parse an SSE text chunk into individual events.
 * OpenCode sends: data: {"type":"...","properties":{...}}
 *
 * @param {string} raw - Raw SSE text chunk
 * @returns {Array<object>} Parsed event objects
 */
function parseSSE(raw) {
  const events = [];
  const lines = raw.split('\n');
  let buffer = '';

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      buffer = line.slice(6);
    } else if (line === '' && buffer) {
      try {
        events.push(JSON.parse(buffer));
      } catch {
        // Malformed JSON — skip
      }
      buffer = '';
    }
  }

  // Handle trailing buffer without final newline
  if (buffer) {
    try {
      events.push(JSON.parse(buffer));
    } catch {
      // Skip
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Session runner
// ---------------------------------------------------------------------------

class OpenCodeSession extends EventEmitter {}

/**
 * Run a prompt through OpenCode headless with full event tracking.
 *
 * @param {string} agent - Agent name
 * @param {string} prompt - User prompt text
 * @param {object} options
 * @param {string} [options.cwd] - Working directory
 * @param {function} [options.onEvent] - Callback for real-time events
 * @param {string} [options.chatId] - Telegram chat ID for logging
 * @returns {Promise<string>} Final assistant output
 */
async function run(agent, prompt, options = {}) {
  const cwd = options.cwd || process.cwd();
  const chatId = options.chatId || 'unknown';
  const startTime = Date.now();

  await ensureServer(cwd);

  return new Promise(async (resolve, reject) => {
    let sessionID = null;
    let sseAbort = null;
    let sessionDone = false;
    let finalOutput = [];
    let toolStartTimes = {};
    let errorCount = 0;

    try {
      // 1. Create session
      const createRes = await fetch(`${SERVER_URL}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!createRes.ok) {
        const errText = await createRes.text().catch(() => 'unknown error');
        throw new Error(`Failed to create session: ${createRes.status} ${errText}`);
      }

      const sessionData = await createRes.json();
      sessionID = sessionData.id;

      logAgentEvent({
        sessionId: sessionID,
        agentName: agent,
        eventType: 'session_start',
        message: `Sesión creada para agente ${agent}`,
        metadata: JSON.stringify({ chatId, promptLength: prompt.length }),
        durationMs: Date.now() - startTime,
      });

      // Session emitter for UI events
      const sessionEmitter = new OpenCodeSession();
      if (options.onEvent) sessionEmitter.on('event', options.onEvent);

      // 2. Start SSE event stream
      const streamRes = await fetch(`${SERVER_URL}/event`);
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();

      sseAbort = () => {
        reader.cancel().catch(() => {});
      };

      // 3. Send prompt (fire and forget — we track completion via SSE)
      fetch(`${SERVER_URL}/session/${sessionID}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent,
          parts: [{ type: 'text', text: prompt }],
        }),
      }).catch((err) => logger.error(`Error enviando prompt: ${err.message}`));

      // 4. Process SSE stream
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const events = parseSSE(text);

        for (const event of events) {
          if (sessionDone) continue;

          // Filter events for our session
          const props = event.properties || {};
          const evtSessionID = props.sessionID || event.sessionID;

          if (evtSessionID && evtSessionID !== sessionID) continue;

          const eventType = event.type || '';

          // --- Session status events ---
          if (eventType === 'session.status') {
            const statusType = props.status?.type || props.status;

            if (statusType === 'busy') {
              logAgentEvent({
                sessionId: sessionID,
                agentName: agent,
                eventType: 'session_busy',
                message: 'Agente procesando...',
              });
            }

            if (statusType === 'idle') {
              // Session completed — agent returned to idle
              sessionDone = true;
              const totalDuration = Date.now() - startTime;

              logAgentEvent({
                sessionId: sessionID,
                agentName: agent,
                eventType: 'session_done',
                message: 'Sesión completada exitosamente',
                metadata: JSON.stringify({
                  totalDuration,
                  toolCount: Object.keys(toolStartTimes).length,
                  errorCount,
                  outputLength: finalOutput.join('').length,
                }),
                durationMs: totalDuration,
              });

              resolve(finalOutput.join('\n').trim() || 'Sin respuesta del agente.');
              return;
            }
          }

          // --- Tool execution events ---
          if (eventType === 'tool.execute' || eventType === 'tool.start') {
            const toolName = props.name || props.tool || props.tool_name || 'unknown';
            toolStartTimes[toolName] = Date.now();

            logAgentEvent({
              sessionId: sessionID,
              agentName: agent,
              eventType: 'tool_execute',
              toolName,
              message: `Ejecutando ${toolName}`,
              metadata: JSON.stringify(props),
            });

            sessionEmitter.emit('event', `[🔧 Ejecutando ${toolName}...]`);
          }

          if (eventType === 'tool.complete' || eventType === 'tool.end') {
            const toolName = props.name || props.tool || props.tool_name || 'unknown';
            const duration = toolStartTimes[toolName]
              ? Date.now() - toolStartTimes[toolName]
              : null;

            logAgentEvent({
              sessionId: sessionID,
              agentName: agent,
              eventType: 'tool_complete',
              toolName,
              message: `${toolName} completado`,
              durationMs: duration,
            });

            sessionEmitter.emit('event', `[✅ ${toolName} completado]`);
          }

          // --- Permission / approval events ---
          if (eventType === 'permission.asked' || eventType === 'require.approval') {
            const permissionID = props.id || props.permissionID || props.requestID;
            const action = props.action || props.tool || 'unknown';

            logAgentEvent({
              sessionId: sessionID,
              agentName: agent,
              eventType: 'approval_required',
              toolName: action,
              message: `Aprobación requerida: ${action}`,
              metadata: JSON.stringify(props),
            });

            const approveFn = () => {
              if (permissionID) {
                return fetch(`${SERVER_URL}/session/${sessionID}/permissions/${permissionID}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ response: 'approve' }),
                });
              }
              return fetch(`${SERVER_URL}/session/${sessionID}/approve`, { method: 'POST' }).catch(
                () => {}
              );
            };

            const rejectFn = () => {
              if (permissionID) {
                return fetch(`${SERVER_URL}/session/${sessionID}/permissions/${permissionID}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ response: 'reject' }),
                });
              }
              return fetch(`${SERVER_URL}/session/${sessionID}/abort`, { method: 'POST' }).catch(
                () => {}
              );
            };

            sessionEmitter.emit('approval_required', {
              action,
              permissionID,
              approve: approveFn,
              reject: rejectFn,
            });
          }

          // --- Error events ---
          if (eventType === 'session.error' || eventType === 'error') {
            errorCount++;
            const errMsg =
              props.error?.message || props.message || props.error || 'Error desconocido';

            logAgentEvent({
              sessionId: sessionID,
              agentName: agent,
              eventType: 'session_error',
              message: errMsg,
              status: 'error',
              metadata: JSON.stringify(props),
              durationMs: Date.now() - startTime,
            });

            logger.error(`OpenCode error en sesión ${sessionID}: ${errMsg}`);
          }

          // --- Assistant text output ---
          if (
            eventType === 'message.assistant' ||
            eventType === 'text.delta' ||
            eventType === 'message.part.delta'
          ) {
            const text = props.text || props.delta || props.content || '';
            if (text) {
              finalOutput.push(text);
            }
          }

          // --- Session aborted ---
          if (eventType === 'session.aborted') {
            sessionDone = true;
            logAgentEvent({
              sessionId: sessionID,
              agentName: agent,
              eventType: 'session_abort',
              message: 'Sesión abortada por el usuario',
              status: 'error',
              durationMs: Date.now() - startTime,
            });

            resolve(finalOutput.join('\n').trim() || 'Sesión abortada.');
            return;
          }
        }
      }

      // Stream ended without explicit done — resolve what we have
      if (!sessionDone) {
        sessionDone = true;
        logAgentEvent({
          sessionId: sessionID,
          agentName: agent,
          eventType: 'session_done',
          message: 'Stream finalizado (sin evento done explícito)',
          metadata: JSON.stringify({ streamEnded: true }),
          durationMs: Date.now() - startTime,
        });

        resolve(finalOutput.join('\n').trim() || 'Sin respuesta del agente.');
      }
    } catch (err) {
      if (sessionID) {
        logAgentEvent({
          sessionId: sessionID,
          agentName: agent,
          eventType: 'session_error',
          message: err.message,
          status: 'error',
          durationMs: Date.now() - startTime,
        });
      }
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------------
// Persistent session management
// ---------------------------------------------------------------------------

/**
 * Create a new OpenCode session.
 *
 * @param {string} cwd - Working directory
 * @returns {Promise<{id: string}>}
 */
async function createSession(cwd) {
  await ensureServer(cwd);

  const createRes = await fetch(`${SERVER_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => 'unknown error');
    throw new Error(`Failed to create session: ${createRes.status} ${errText}`);
  }

  return createRes.json();
}

/**
 * Send a message to an existing OpenCode session and stream the response.
 *
 * @param {string} sessionId - AgentHub session ID (for logging)
 * @param {string} opencodeSessionId - OpenCode session ID
 * @param {string} agent - Agent name
 * @param {string} prompt - User message
 * @param {object} options
 * @param {string} [options.cwd] - Working directory
 * @param {function} [options.onEvent] - Callback for real-time events
 * @param {function} [options.onApproval] - Callback for permission requests
 * @param {AbortSignal} [options.signal] - AbortSignal for SSE stream cancellation (pause support)
 * @param {string} [options.chatId] - Telegram chat ID for logging
 * @returns {Promise<{output: string, events: Array}>}
 */
async function sendMessage(sessionId, opencodeSessionId, agent, prompt, options = {}) {
  const cwd = options.cwd || process.cwd();
  const chatId = options.chatId || 'unknown';
  const startTime = Date.now();
  const events = [];
  let finalOutput = [];
  let toolStartTimes = {};
  let sessionDone = false;
  let errorCount = 0;

  await ensureServer(cwd);

  return new Promise(async (resolve, reject) => {
    let sseAbort = null;

    try {
      // Start SSE event stream
      const fetchOptions = {};
      if (options.signal) {
        fetchOptions.signal = options.signal;
      }
      const streamRes = await fetch(`${SERVER_URL}/event`, fetchOptions);
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();

      sseAbort = () => {
        reader.cancel().catch(() => {});
      };

      // Send prompt
      fetch(`${SERVER_URL}/session/${opencodeSessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent,
          parts: [{ type: 'text', text: prompt }],
        }),
      }).catch((err) => logger.error(`Error enviando prompt: ${err.message}`));

      // Process SSE stream
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const parsedEvents = parseSSE(text);

        for (const event of parsedEvents) {
          if (sessionDone) continue;

          const props = event.properties || {};
          const evtSessionID = props.sessionID || event.sessionID;

          if (evtSessionID && evtSessionID !== opencodeSessionId) continue;

          const eventType = event.type || '';
          events.push(event);

          // --- Session status events ---
          if (eventType === 'session.status') {
            const statusType = props.status?.type || props.status;

            if (statusType === 'busy') {
              if (options.onEvent) options.onEvent('⏳ Procesando...');
            }

            if (statusType === 'idle') {
              sessionDone = true;
              const totalDuration = Date.now() - startTime;

              if (options.onEvent) options.onEvent('✅ Completado');

              resolve({
                output: finalOutput.join('\n').trim() || 'Sin respuesta del agente.',
                events,
                durationMs: totalDuration,
                errorCount,
              });
              return;
            }
          }

          // --- Tool execution events ---
          if (eventType === 'tool.execute' || eventType === 'tool.start') {
            const toolName = props.name || props.tool || props.tool_name || 'unknown';
            toolStartTimes[toolName] = Date.now();

            if (options.onEvent) options.onEvent(`[🔧 Ejecutando ${toolName}...]`);
          }

          if (eventType === 'tool.complete' || eventType === 'tool.end') {
            const toolName = props.name || props.tool || props.tool_name || 'unknown';
            const duration = toolStartTimes[toolName]
              ? Date.now() - toolStartTimes[toolName]
              : null;

            if (options.onEvent) options.onEvent(`[✅ ${toolName} completado]`);
          }

          // --- Permission / approval events ---
          if (eventType === 'permission.asked' || eventType === 'require.approval') {
            const permissionID = props.id || props.permissionID || props.requestID;
            const action = props.action || props.tool || 'unknown';

            if (options.onApproval) {
              options.onApproval({
                action,
                permissionID,
                sessionId: opencodeSessionId,
                approve: () => {
                  if (permissionID) {
                    return fetch(
                      `${SERVER_URL}/session/${opencodeSessionId}/permissions/${permissionID}`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ response: 'approve' }),
                      }
                    );
                  }
                  return fetch(`${SERVER_URL}/session/${opencodeSessionId}/approve`, {
                    method: 'POST',
                  }).catch(() => {});
                },
                reject: () => {
                  if (permissionID) {
                    return fetch(
                      `${SERVER_URL}/session/${opencodeSessionId}/permissions/${permissionID}`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ response: 'reject' }),
                      }
                    );
                  }
                  return fetch(`${SERVER_URL}/session/${opencodeSessionId}/abort`, {
                    method: 'POST',
                  }).catch(() => {});
                },
              });
            }
          }

          // --- Error events ---
          if (eventType === 'session.error' || eventType === 'error') {
            errorCount++;
            const errMsg =
              props.error?.message || props.message || props.error || 'Error desconocido';

            logger.error(`OpenCode error en sesión ${opencodeSessionId}: ${errMsg}`);
          }

          // --- Assistant text output ---
          if (
            eventType === 'message.assistant' ||
            eventType === 'text.delta' ||
            eventType === 'message.part.delta'
          ) {
            const text = props.text || props.delta || props.content || '';
            if (text) {
              finalOutput.push(text);
            }
          }

          // --- Session aborted ---
          if (eventType === 'session.aborted') {
            sessionDone = true;
            resolve({
              output: finalOutput.join('\n').trim() || 'Sesión abortada.',
              events,
              durationMs: Date.now() - startTime,
              errorCount,
            });
            return;
          }
        }
      }

      // Stream ended without explicit done
      if (!sessionDone) {
        sessionDone = true;
        resolve({
          output: finalOutput.join('\n').trim() || 'Sin respuesta del agente.',
          events,
          durationMs: Date.now() - startTime,
          errorCount,
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Expected during pause/cancel — don't treat as error
        logger.debug(`SSE stream aborted for session ${opencodeSessionId}`);
        resolve({
          output: finalOutput.join('\n').trim() || 'Sesión cancelada.',
          events,
          durationMs: Date.now() - startTime,
          errorCount,
          aborted: true,
        });
        return;
      }
      reject(err);
    }
  });
}

/**
 * Get session info including token usage from OpenCode.
 *
 * @param {string} opencodeSessionId
 * @returns {Promise<object|null>}
 */
async function getSessionInfo(opencodeSessionId) {
  try {
    const res = await fetch(`${SERVER_URL}/session/${opencodeSessionId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Get all active OpenCode sessions.
 *
 * @returns {Promise<Array>}
 */
async function getActiveSessions() {
  try {
    const res = await fetch(`${SERVER_URL}/sessions`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAvailableAgents() {
  try {
    const res = await fetch(`${SERVER_URL}/agent`);
    if (!res.ok) return ['sdd-orchestrator', 'gentleman'];
    const agents = await res.json();
    return agents.map((a) => a.name);
  } catch {
    return ['sdd-orchestrator', 'gentleman'];
  }
}

function cleanOutput(raw) {
  if (!raw) return '';
  return raw.trim();
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  run,
  createSession,
  sendMessage,
  getSessionInfo,
  getActiveSessions,
  getAvailableAgents,
  cleanOutput,
  stripAnsi,
  shutdownServer,
  ensureServer,
  isServerRunning,
  parseSSE,
  getServerStatus: () => ({ running: !!serverProcess, ready: serverReady }),
};
