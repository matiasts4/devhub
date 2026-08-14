/**
 * DevHub Sidecar Backend
 *
 * Responsabilidades:
 * 1. Gestionar sesiones PTY persistentes (sobreviven al cierre de ventana)
 * 2. Escribir PID en $DEVHUB_HOME/sidecar.pid (o ~/.devhub) para que Tauri detecte si ya corre
 * 3. Escribir puerto en $DEVHUB_HOME/sidecar-port.txt para el shutdown graceful
 * 4. Exponer POST /shutdown para que Tauri cierre el sidecar limpiamente
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const os = require('os');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { resolveSidecarSessionCwd } = require('./sessionCwd');
const { buildSidecarSpawnConfig, parseBooleanQueryFlag } = require('./sessionSpawn');
const {
  ensureAgentDetectionSession,
  ingestAgentDetectionFromFilteredOutput,
  notifyUserInput,
  tickAgentDetection,
  processOscTitle,
  stripOscTitleSequences,
  processOscProgress,
  generateSessionHookToken,
  handleHookReport,
  handleBridgeHookReport,
  ANTIGRAVITY_BRIDGE_SOURCE,
  writeHookBridgeConfig,
  createOpenCodeSseClient,
} = require('./bundled/agentDetection.cjs');
const {
  applyAgentTuiDetection,
  buildAgentStateFrame,
  buildHistoryReplay,
  buildServerMessage,
  detectAntigravityTuiReady,
  detectKimiTuiReady,
  detectQodercliTuiReady,
  detectOpenCodeSessionId,
  detectOpenCodeTuiReady,
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
  getTransportMode,
  parseClientMessage,
  reapTypedAgentSessionIfExited,
  shouldPromoteAgentFromOutput,
  synthesizeAgentSessionId,
  updateSessionModeFromInput,
} = require('./sessionTransport');
const { writeOpencodeReadyMarker } = require('./opencodeReadyMarker');
const { writeAntigravityReadyMarker } = require('./antigravityReadyMarker');
const { writeQodercliReadyMarker } = require('./qodercliReadyMarker');
const {
  shouldRespawnShellAfterPtyExit,
  shouldRelaunchAgentAfterCtrlCRespawn,
} = require('./ptyRespawnPolicy.cjs');
const { logSidecarEvent } = require('./sidecarLog.cjs');

// ─── Agent session binder (kimi/codex fs correlation) ────────────────────────
// Static require of the local CJS twin: packaged desktop builds ship no src/
// tree, so the previous lazy import('../src/lib/terminal/agentSessionBinder.js')
// failed silently in production (.catch(() => null)) and disabled kimi/codex
// session binding entirely. A load failure here must be LOUD, not silent.
let agentSessionBinder = null;
try {
  agentSessionBinder = require('./agentSessionBinder.cjs');
} catch (binderLoadError) {
  console.error(
    '[Sidecar] agentSessionBinder.cjs FAILED to load — kimi/codex session binding DISABLED:',
    binderLoadError?.message
  );
  logSidecarEvent('agent-session-binder-require-failed', {
    error: String(binderLoadError?.message || binderLoadError),
  });
}

/** Truncates commands for log lines (restore forensics, not full transcripts). */
function truncateForLog(value, max = 200) {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max) : text;
}

// ─── Directorios de estado ────────────────────────────────────────────────────
// Respeta DEVHUB_HOME cuando el wrapper / Tauri lo pasan (permite tests con home
// temporal y consistencia con la lógica de extracción del wrapper). Fallback al
// default para compatibilidad.
const DEVHUB_DIR = process.env.DEVHUB_HOME || path.join(os.homedir(), '.devhub');
const PID_FILE = path.join(DEVHUB_DIR, 'sidecar.pid');
const PORT_FILE = path.join(DEVHUB_DIR, 'sidecar-port.txt');
const PORT = parseInt(process.env.SIDECAR_PORT || '4000', 10);

// Crear directorio de estado si no existe
if (!fs.existsSync(DEVHUB_DIR)) {
  fs.mkdirSync(DEVHUB_DIR, { recursive: true });
}

// Limpiar archivos al salir (cualquier señal)
let isCleaningUp = false;

function writeRuntimeFiles() {
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
  fs.writeFileSync(PORT_FILE, String(PORT), 'utf8');
  console.log(`[Sidecar] PID ${process.pid} → ${PID_FILE}`);
  console.log(`[Sidecar] Port ${PORT} → ${PORT_FILE}`);
}

function cleanup(exitCode = 0) {
  if (isCleaningUp) return;
  isCleaningUp = true;
  try {
    fs.unlinkSync(PID_FILE);
  } catch (_) {}
  try {
    fs.unlinkSync(PORT_FILE);
  } catch (_) {}
  console.log('[Sidecar] Archivos PID/port eliminados. Bye.');
  process.exit(exitCode);
}

process.on('SIGTERM', () => cleanup(0));
process.on('SIGINT', () => cleanup(0));

// ─── Sesiones PTY persistentes ────────────────────────────────────────────────
// Clave: sessionId → { ptyProcess, history: string[], clients: Set<WebSocket> }
const sessions = new Map();

// ─── Token compartido para hooks bridge (Antigravity out-of-process) ─────────
// Los hooks de Antigravity corren fuera de cualquier sesión PTY, así que no
// heredan el hookToken por sesión. Autentican con un único token compartido que
// se escribe en ~/.devhub/hook-bridge.json al arrancar (ver bridgeConfig).
// Paridad con getBridgeToken() de src/lib/terminal/ttyServer.js.
let sidecarBridgeToken = null;
function getSidecarBridgeToken() {
  if (!sidecarBridgeToken) {
    sidecarBridgeToken = generateSessionHookToken();
  }
  return sidecarBridgeToken;
}

function writeSidecarHookBridgeConfig() {
  try {
    const bridgeHookUrl = process.env.DEVHUB_HOOK_URL || `http://127.0.0.1:${PORT}/agent-hook`;
    writeHookBridgeConfig({ url: bridgeHookUrl, token: getSidecarBridgeToken() });
    console.log(`[Sidecar] hook bridge config → ${bridgeHookUrl}`);
  } catch (err) {
    // Non-fatal: los bridges hacen fail-open sin el archivo de discovery.
    console.warn('[Sidecar] hook bridge config write FAILED (non-fatal):', err?.message);
  }
}

function killTmuxSessionBestEffort(sessionName) {
  const normalized = String(sessionName || '').trim();
  if (!normalized || os.platform() === 'win32') return;
  try {
    spawnSync('tmux', ['kill-session', '-t', normalized], { stdio: 'ignore', timeout: 5000 });
  } catch (_) {}
}

/** Kill shell + OpenCode/agent children. pty.kill() alone often leaves orphans on Windows. */
function killProcessTreeBestEffort(pid) {
  const normalized = Number(pid);
  if (!Number.isInteger(normalized) || normalized <= 0) return false;
  try {
    if (os.platform() === 'win32') {
      const result = spawnSync('taskkill', ['/T', '/F', '/PID', String(normalized)], {
        stdio: 'ignore',
        timeout: 5000,
      });
      return result.status === 0;
    }
    try {
      process.kill(-normalized, 'SIGTERM');
    } catch (_) {}
    try {
      process.kill(normalized, 'SIGTERM');
    } catch (_) {}
    try {
      process.kill(-normalized, 'SIGKILL');
    } catch (_) {}
    try {
      process.kill(normalized, 'SIGKILL');
    } catch (_) {}
    return true;
  } catch (_) {
    return false;
  }
}

function abortOpenCodeSessionBestEffort(opencodeSessionId) {
  const normalized = String(opencodeSessionId || '').trim();
  if (!normalized) return;
  const port = Number(process.env.OPENCODE_PORT || 4154);
  const url = `http://127.0.0.1:${port}/session/${encodeURIComponent(normalized)}/abort`;
  try {
    void fetch(url, { method: 'POST' }).catch(() => {});
  } catch (_) {}
}

function sendToClient(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(buildServerMessage(ws.__devhubTransport || 'raw', payload));
  } catch (_) {}
}

function broadcastSessionPayload(session, payload) {
  for (const ws of session.clients) {
    sendToClient(ws, payload);
  }
}

// ─── Agent session-id binding (fs correlation) ───────────────────────────────
// Mirrors src/lib/terminal/ttyServer.js. DevHub-launched grok/qodercli ids are
// pre-assigned in their launch commands; kimi/codex have no pre-assign flag —
// and ANY provider typed by hand in a shell carries no id — so we correlate
// the on-disk session created right after the typed launch.
// The binder lives in ./agentSessionBinder.cjs (required statically above) so
// packaged builds — which ship no src/ tree — keep binding enabled.
const AGENT_SESSION_BINDABLE_TYPES = new Set(['kimi', 'codex', 'grok', 'qodercli']);
const AGENT_SESSION_DETECTED_WS_TYPE = {
  kimi: 'kimi-session-detected',
  codex: 'codex-session-detected',
  grok: 'grok-session-detected',
  qodercli: 'qoder-session-detected',
};

function maybeStartAgentSessionBinding(session) {
  try {
    const agentType = session?.agentType;
    const eventType = AGENT_SESSION_DETECTED_WS_TYPE[agentType];
    if (!eventType) return;

    const synthesized = synthesizeAgentSessionId(agentType, session.id);
    const explicitId =
      session.agentSessionId && session.agentSessionId !== synthesized
        ? session.agentSessionId
        : null;
    if (explicitId) {
      // Resume/pre-assigned form typed or injected by the client — surface it
      // once so the frontend can persist it. No binder needed for this launch.
      if (session._lastBroadcastAgentSessionId !== explicitId) {
        session._lastBroadcastAgentSessionId = explicitId;
        broadcastSessionPayload(session, {
          type: eventType,
          sessionId: explicitId,
          agentType,
        });
        logSidecarEvent('agent-session-detected-broadcast', {
          provider: agentType,
          sessionId: session.id,
          agentSessionId: explicitId,
          eventType,
          origin: 'explicit',
        });
      }
      return;
    }

    if (!AGENT_SESSION_BINDABLE_TYPES.has(agentType)) return;
    if (session._agentSessionBinderStarted) return;

    session._agentSessionBinderStarted = true;
    if (!agentSessionBinder || typeof agentSessionBinder.bindAgentSession !== 'function') {
      // Require failed at startup (already logged loudly) — nothing to do.
      logSidecarEvent('agent-session-binder-unavailable', {
        sessionId: session.id,
        agentType,
      });
      return;
    }

    logSidecarEvent('agent-session-binder-start', {
      sessionId: session.id,
      agentType,
      cwd: session.cwd,
    });

    agentSessionBinder.bindAgentSession({
      sessionId: session.id,
      agentType,
      cwd: session.cwd,
      spawnedAt: Date.now(),
      onBound: (agentSessionId) => {
        try {
          session.agentSessionId = agentSessionId;
          logSidecarEvent('agent-session-binder-bound', {
            sessionId: session.id,
            agentType,
            agentSessionId,
          });
          broadcastSessionPayload(session, {
            type: AGENT_SESSION_DETECTED_WS_TYPE[agentType],
            sessionId: agentSessionId,
            agentType,
            cwd: session.cwd,
          });
          logSidecarEvent('agent-session-detected-broadcast', {
            provider: agentType,
            sessionId: session.id,
            agentSessionId,
            eventType: AGENT_SESSION_DETECTED_WS_TYPE[agentType],
            origin: 'binder',
          });
        } catch (_) {
          // best-effort
        }
      },
      onSettled: (status, info) => {
        try {
          if (status === 'timeout') {
            // Grok (and any late-creating provider) may write its session dir
            // only after the user's first prompt — well past the bind window.
            // Re-arm so the next input re-triggers the binder instead of
            // giving up for the lifetime of this pty session.
            session._agentSessionBinderStarted = false;
          }
          if (status === 'ambiguous' || status === 'timeout') {
            logSidecarEvent(`agent-session-binder-${status}`, {
              sessionId: session.id,
              agentType,
              ...(status === 'ambiguous'
                ? {
                    candidates: (info?.candidates || [])
                      .map((candidate) => candidate?.sessionId)
                      .filter(Boolean),
                  }
                : {}),
            });
          }
        } catch (_) {
          // best-effort
        }
      },
    });
  } catch (_) {
    // best-effort — never break the sidecar on binding failures
  }
}

function spawnSidecarPtyProcess(session) {
  const spawnConfig = buildSidecarSpawnConfig({
    sessionId: session.id,
    cwd: session.cwd,
    isSwarmRole: Boolean(session.swarmContext?.isSwarmRole),
    launchId: session.swarmContext?.launchId || null,
    roleKey: session.swarmContext?.roleKey || null,
    env: process.env,
    hookToken: session.hookToken || null,
  });
  const shell =
    spawnConfig.shell ||
    (os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash');
  const cols = session.termsize?.cols || 120;
  const rows = session.termsize?.rows || 36;
  const ptyProcess = pty.spawn(shell, spawnConfig.args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: session.cwd,
    env: spawnConfig.env,
  });
  session.ptyProcess = ptyProcess;
  session.termsize = { cols, rows };
  session.tmuxSession = spawnConfig.tmuxSession || null;
  return { ptyProcess, shell, spawnConfig };
}

function resetSessionAfterTuiPtyDeath(session) {
  session.mode = 'shell';
  session.historyEnabled = true;
  session.history = [];
  session.outputTail = '';
  session.pendingInput = '';
  session.agentTuiState = null;
  session.agentTuiStateAt = null;
  session.hookState = null;
  session.agentLaunchOrigin = null;
  session._typedAgentReaper = null;
  // Keep opencodeSessionId for Relanzar; drop live TUI markers so a later
  // intentional `exit` is not treated as another Ctrl+C TUI death.
  session.agentType = null;
  session.agentSessionId = null;
}

function finalizeSidecarSessionExit(session, exitCode, signal) {
  console.log(`[Sidecar] Session ${session.id} exited.`, { exitCode, signal });
  logSidecarEvent('pty-session-exit', {
    sessionId: session.id,
    exitCode: exitCode ?? 0,
    signal: signal ?? null,
    agentType: session.agentType || null,
    agentSessionId: session.agentSessionId || null,
  });
  // N7: final agent-state frame (idle, reason 'exit') BEFORE the exit frame so
  // clients get a deterministic "agent finished" signal instead of a dangling
  // running/blocked badge.
  if (session.agentType) {
    broadcastSessionPayload(
      session,
      buildAgentStateFrame(session, 'idle', { reason: 'exit', at: Date.now() })
    );
  }
  broadcastSessionPayload(session, {
    type: 'exit',
    exitCode: exitCode ?? 0,
    signal: signal ?? null,
  });
  for (const client of session.clients) {
    try {
      client.close();
    } catch (_) {}
  }
  sessions.delete(session.id);
}

function tryRespawnShellAfterTuiExit(session, exitCode, signal) {
  const priorAgentType = session.agentType;
  const priorLaunchCommand = session.launchCommand || null;
  const wasFocused = session.inputFocused === true;
  const should = shouldRespawnShellAfterPtyExit({
    platform: os.platform(),
    mode: session.mode,
    agentType: session.agentType,
    launchCommand: priorLaunchCommand,
    exitCode,
    respawnCount: session._tuiCtrlCRespawnCount || 0,
  });
  if (!should) return false;

  session._tuiCtrlCRespawnCount = (session._tuiCtrlCRespawnCount || 0) + 1;
  const bootstrapped = Boolean(priorLaunchCommand && String(priorLaunchCommand).trim());
  const relaunchAgent = shouldRelaunchAgentAfterCtrlCRespawn({
    inputFocused: wasFocused,
    launchCommand: priorLaunchCommand,
    agentType: priorAgentType,
  });
  console.log(`[Sidecar] Agent TUI PTY exited — respawning usable shell`, {
    sessionId: session.id,
    exitCode,
    signal,
    respawnCount: session._tuiCtrlCRespawnCount,
    inputFocused: wasFocused,
    bootstrapped,
    relaunchAgent,
  });

  resetSessionAfterTuiPtyDeath(session);
  // Keep launchCommand across bare-shell respawn so Relanzar / collateral restore work.
  session.launchCommand = priorLaunchCommand;

  let spawnResult;
  try {
    spawnResult = spawnSidecarPtyProcess(session);
  } catch (err) {
    console.error(`[Sidecar] TUI shell respawn FAILED`, {
      sessionId: session.id,
      error: err?.message,
    });
    return false;
  }

  attachSidecarPtyHandlers(session);

  // Nested typed-TUI Ctrl+C heal: no banner (feels like a normal shell return).
  // Bootstrapped modal agents: short notice so the panel doesn't look frozen.
  if (bootstrapped) {
    const notice = relaunchAgent
      ? '\r\n\x1b[33m[DevHub]\x1b[0m Panel hermano recuperado — relanzando agente…\r\n'
      : '\r\n\x1b[33m[DevHub]\x1b[0m TUI cerrada. Shell lista.\r\n';
    broadcastSessionPayload(session, { type: 'output', data: notice });
  }

  if (relaunchAgent && priorLaunchCommand) {
    const cmd = String(priorLaunchCommand)
      .replace(/\s*#recovery-\d+\s*$/, '')
      .trim();
    if (cmd) {
      // ponytail: tiny yield so the new ConPTY accepts input; was 250ms (felt slow)
      setTimeout(() => {
        try {
          if (!sessions.has(session.id) || !session.ptyProcess) return;
          session.ptyProcess.write(`${cmd}\r`);
        } catch (_) {}
      }, 50);
    }
  }

  console.log('[Sidecar] TUI shell respawned', {
    sessionId: session.id,
    shell: spawnResult.shell,
    relaunchAgent,
  });
  logSidecarEvent('pty-session-respawn', {
    sessionId: session.id,
    shell: spawnResult.shell,
    relaunchAgent,
    respawnCount: session._tuiCtrlCRespawnCount,
    exitCode: exitCode ?? 0,
    agentType: priorAgentType || null,
  });
  return true;
}

function attachSidecarPtyHandlers(session) {
  const sessionId = session.id;
  const ptyProcess = session.ptyProcess;

  ptyProcess.on('data', (data) => {
    const now = Date.now();
    session.lastSeenAt = new Date().toISOString();
    session.lastActivityAt = now;
    session.lastOutputAt = now;

    processOscTitle(session, data);
    processOscProgress(session, data);
    let filteredData = data;
    if (typeof filteredData === 'string') {
      filteredData = stripOscTitleSequences(filteredData);
    }
    filteredData = filterTerminalOutputForSession(session, filteredData);

    if (typeof filteredData === 'string' && filteredData.length === 0) {
      return;
    }

    // Guardar en buffer (máx 10000 chars) con seguimiento incremental O(1)
    if (session.historyEnabled) {
      session.history.push(filteredData);
      session.historyTotalLen = (session.historyTotalLen || 0) + filteredData.length;
      while (session.history.length > 1 && session.historyTotalLen > 10000) {
        const shifted = session.history.shift();
        if (shifted) session.historyTotalLen -= shifted.length;
      }
    }

    // Las TUIs de agentes apagan historyEnabled (para no re-pintar frames en el
    // replay WS), pero Zed necesita leer el contenido igual vía /sessions/:id/output.
    // ponytail: cola string de 32KB; si algún día duele el GC, pasar a ring buffer.
    if (typeof filteredData === 'string') {
      session.outputTail = (session.outputTail + filteredData).slice(-32768);
    }

    // Fast-path: micro-chunks (tecleo estándar de 1-4 caracteres sin ESC) no requieren parser pesado de TUIs
    const isMicroChunk =
      typeof filteredData === 'string' &&
      filteredData.length <= 4 &&
      !filteredData.includes('\x1b');

    if (!isMicroChunk && typeof filteredData === 'string') {
      if (filteredData.includes('ses_') || filteredData.includes('opencode')) {
        const detectedSessionId = detectOpenCodeSessionId(filteredData);
        if (detectedSessionId && session.opencodeSessionId !== detectedSessionId) {
          session.opencodeSessionId = detectedSessionId;
          broadcastSessionPayload(session, {
            type: 'opencode-session-detected',
            sessionId: detectedSessionId,
          });
          logSidecarEvent('agent-session-detected-broadcast', {
            provider: 'opencode',
            sessionId: session.id,
            agentSessionId: detectedSessionId,
            eventType: 'opencode-session-detected',
            origin: 'output-scrape',
          });
        }
      }

      // Detect TUI readiness for agents started without an explicit initialCommand.
      // W7: output-detected agents live in tmux/pre-attached panes — mark the
      // origin so the typed-agent reaper never touches them.
      // Promotion from output alone is gated by shouldPromoteAgentFromOutput:
      // explicit non-agent launches (e.g. `pnpm electron:up`) and single weak
      // footer hints never promote — that log noise previously poisoned
      // panels as fake agents (workspace activity dot false positives).
      const kimiOutReady = detectKimiTuiReady(filteredData);
      const opencodeOutReady = !kimiOutReady && detectOpenCodeTuiReady(filteredData);
      const agyOutReady = !kimiOutReady && !opencodeOutReady && detectAntigravityTuiReady(filteredData);
      const qodercliOutReady =
        !kimiOutReady && !opencodeOutReady && !agyOutReady && detectQodercliTuiReady(filteredData);
      if (kimiOutReady && (session.agentType || shouldPromoteAgentFromOutput(session, 'kimi', filteredData))) {
        if (!session.agentType) {
          applyAgentTuiDetection(session, 'kimi');
          session.agentLaunchOrigin = 'output';
        }
        maybeStartAgentSessionBinding(session);
      } else if (
        opencodeOutReady &&
        (session.agentType || shouldPromoteAgentFromOutput(session, 'opencode', filteredData))
      ) {
        if (session.mode !== 'tui') {
          session.mode = 'tui';
          session.historyEnabled = false;
        }
        if (!session.agentType) {
          applyAgentTuiDetection(session, 'opencode');
          session.agentLaunchOrigin = 'output';
        }
        if (session.tmuxSession && !session._opencodeReadyMarkerWritten) {
          writeOpencodeReadyMarker(session.tmuxSession, {
            sessionId,
            opencodeSessionId: session.opencodeSessionId || null,
            reason: 'sidecar-tui-footer',
          });
          session._opencodeReadyMarkerWritten = true;
        }
      } else if (
        agyOutReady &&
        (session.agentType || shouldPromoteAgentFromOutput(session, 'agy', filteredData))
      ) {
        // W1: Antigravity output-based start detection (tmux/swarm pre-attach).
        if (!session.agentType) {
          applyAgentTuiDetection(session, 'agy');
          session.agentLaunchOrigin = 'output';
        }
        if (session.tmuxSession && !session._antigravityReadyMarkerWritten) {
          writeAntigravityReadyMarker(session.tmuxSession, {
            sessionId,
            reason: 'sidecar-tui-footer',
          });
          session._antigravityReadyMarkerWritten = true;
        }
      } else if (
        qodercliOutReady &&
        (session.agentType || shouldPromoteAgentFromOutput(session, 'qodercli', filteredData))
      ) {
        if (!session.agentType) {
          applyAgentTuiDetection(session, 'qodercli');
          session.agentLaunchOrigin = 'output';
        }
        maybeStartAgentSessionBinding(session);
        if (session.tmuxSession && !session._qodercliReadyMarkerWritten) {
          writeQodercliReadyMarker(session.tmuxSession, {
            sessionId,
            reason: 'sidecar-tui-footer',
          });
          session._qodercliReadyMarkerWritten = true;
        }
      }

      if (filteredData.length > 0) {
        const ingestResult = ingestAgentDetectionFromFilteredOutput(session, filteredData, now);
        session._lastAgentStateEvent = ingestResult;
        if (ingestResult.published && session.agentTuiState) {
          broadcastSessionPayload(session, buildAgentStateFrame(session, session.agentTuiState));
        }

        // W7: reap typed-launch agents whose child process exited (shell
        // prompt returned). Emits a terminal agent-state frame (idle, reason
        // 'agent-exit') so clients get a deterministic "agent finished".
        const agentExitFrame = reapTypedAgentSessionIfExited(session, filteredData, now);
        if (agentExitFrame) {
          broadcastSessionPayload(session, agentExitFrame);
        }
      }
    }

    broadcastSessionPayload(session, { type: 'output', data: filteredData });
  });

  ptyProcess.on('exit', (code, sig) => {
    // node-pty may emit (exitCode, signal) or a single options object.
    const exitCode = typeof code === 'object' && code !== null ? code.exitCode : code;
    const signal = typeof code === 'object' && code !== null ? code.signal : sig;
    if (tryRespawnShellAfterTuiExit(session, exitCode ?? 0, signal ?? null)) {
      return;
    }
    finalizeSidecarSessionExit(session, exitCode ?? 0, signal ?? null);
  });
}

function getOrCreateSession(sessionId, cwd, swarmContext = {}) {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  const cwdResolution = resolveSidecarSessionCwd(cwd || os.homedir());
  const effectiveCwd = cwdResolution.effectiveCwd;

  const session = {
    id: sessionId,
    ptyProcess: null,
    history: [], // Buffer de los últimos 5000 chars para replay al reconectar
    clients: new Set(),
    cwd: effectiveCwd,
    createdAt: Date.now(),
    lastSeenAt: new Date().toISOString(),
    lastActivityAt: Date.now(),
    lastOutputAt: Date.now(),
    mode: 'shell',
    historyEnabled: true,
    outputTail: '', // Cola siempre activa (aunque history se apague en modo TUI) para /sessions/:id/output
    opencodeSessionId: null,
    agentType: null,
    agentSessionId: null,
    agentTuiState: null,
    agentTuiStateAt: null,
    pendingInput: '',
    title: null,
    _oscTitleBuffer: '',
    oscProgress: '',
    _oscProgressBuffer: '',
    agentStateMachine: null,
    detectionBuffer: '',
    tmuxSession: null,
    termsize: { cols: 120, rows: 36 },
    _tuiCtrlCRespawnCount: 0,
    // Focused panel receives keyboard; unfocused siblings killed by Win Ctrl+C
    // should relaunch their agent instead of staying on a bare shell.
    inputFocused: false,
    launchCommand: null,
    hookToken: generateSessionHookToken(),
    hookState: null,
    swarmContext: {
      isSwarmRole: Boolean(swarmContext.isSwarmRole),
      launchId: swarmContext.launchId || null,
      roleKey: swarmContext.roleKey || null,
    },
  };

  ensureAgentDetectionSession(session);
  const { shell, spawnConfig } = spawnSidecarPtyProcess(session);
  attachSidecarPtyHandlers(session);

  sessions.set(sessionId, session);
  console.log('[Sidecar] Nueva sesión PTY', {
    sessionId,
    shell,
    requestedCwd: cwdResolution.requestedCwd,
    effectiveCwd,
    usedFallback: cwdResolution.usedFallback,
    tmuxSession: spawnConfig.tmuxSession || null,
    tmuxEnabled: spawnConfig.tmuxEnabled,
    isSwarmRole: Boolean(swarmContext.isSwarmRole),
  });
  logSidecarEvent('pty-session-created', {
    sessionId,
    cwd: effectiveCwd,
    shell,
    agentType: session.agentType || null,
    requestedCwd: cwdResolution.requestedCwd,
    usedFallback: cwdResolution.usedFallback,
    tmuxSession: spawnConfig.tmuxSession || null,
    isSwarmRole: Boolean(swarmContext.isSwarmRole),
  });
  return session;
}
// ─── HTTP Server ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    pid: process.pid,
    port: PORT,
    sessions: sessions.size,
    uptime: process.uptime(),
  });
});

app.get('/sessions', (_req, res) => {
  const list = Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    cwd: s.cwd,
    clients: s.clients.size,
    createdAt: s.createdAt,
  }));
  res.json({ sessions: list });
});

// Single session snapshot for panel status polling.
app.get('/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({
    terminalId: req.params.id,
    mode: session.mode || 'shell',
    socketCount: session.clients?.size || 0,
    createdAt: session.createdAt || null,
    lastActivityAt: session.lastActivityAt || null,
    lastOutputAt: session.lastOutputAt || null,
    lastSeenAt: session.lastSeenAt || null,
    cwd: session.cwd || null,
    shell: session.ptyProcess?.shell || null,
    title: null,
    restored: false,
    alive: true,
    opencodeSessionId: session.opencodeSessionId || null,
    hermesSessionId: null,
    agentType: session.agentType || null,
    agentSessionId: session.agentSessionId || null,
    agentTuiState: session.agentTuiState || null,
    agentTuiStateAt: session.agentTuiStateAt || null,
    initialCommand: null,
  });
});

// Output buffer for a specific session (for external observers like Zed assistant to "see" contents)
app.get('/sessions/:id/output', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  // history se vacía al detectar una TUI de agente; outputTail sigue vivo siempre.
  const output = (session.history || []).join('') || session.outputTail || '';
  res.json({
    output,
    session_id: req.params.id,
    cwd: session.cwd || null,
    createdAt: session.createdAt || null,
  });
});

// HTTP input for Zed assistant (symmetric to /output — Phase 1)
app.put('/sessions/:id/input', (req, res) => {
  const sessionId = req.params.id;
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const data = req.body?.data;
  if (data === undefined || data === null || typeof data !== 'string') {
    return res.status(400).json({ error: 'data field (string) is required' });
  }

  const filteredInput = filterTerminalInputForSession(session, data);
  if (filteredInput === null) {
    return res.status(400).json({ error: 'input rejected by session filter' });
  }

  updateSessionModeFromInput(session, filteredInput);
  maybeStartAgentSessionBinding(session);

  const detectedSessionId = detectOpenCodeSessionId(filteredInput);
  if (detectedSessionId && session.opencodeSessionId !== detectedSessionId) {
    session.opencodeSessionId = detectedSessionId;
    broadcastSessionPayload(session, {
      type: 'opencode-session-detected',
      sessionId: detectedSessionId,
    });
    logSidecarEvent('agent-session-detected-broadcast', {
      provider: 'opencode',
      sessionId: session.id,
      agentSessionId: detectedSessionId,
      eventType: 'opencode-session-detected',
      origin: 'http-input',
    });
  }

  logSidecarEvent('terminal-input-inject', {
    sessionId,
    command: truncateForLog(filteredInput),
    source: 'http-put',
  });

  try {
    session.ptyProcess.write(filteredInput);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'write failed' });
  }

  return res.json({ session_id: sessionId, sent: true, source: 'sidecar' });
});

app.delete('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  for (const client of session.clients) {
    try {
      client.close();
    } catch (_) {}
  }

  abortOpenCodeSessionBestEffort(session.opencodeSessionId);
  killTmuxSessionBestEffort(session.tmuxSession);

  const ptyPid = session.ptyProcess?.pid || session.ptyPid || null;
  killProcessTreeBestEffort(ptyPid);
  try {
    session.ptyProcess?.kill?.();
  } catch (_) {}

  sessions.delete(sessionId);
  console.log(`[Sidecar] Session ${sessionId} terminada por cierre explícito.`, {
    ptyPid,
  });
  return res.json({ success: true, sessionId });
});

// Endpoint POST /agent-hook — reportes de estado por hooks de lifecycle del agente
app.post('/agent-hook', (req, res) => {
  const jsonStr = JSON.stringify(req.body || {});
  if (jsonStr.length > 4096) {
    return res.status(400).json({ error: 'Payload size exeeded 4KB limit' });
  }

  // Los reportes del bridge (antigravity-bridge.mjs) llevan un token compartido
  // y SIN terminalId — se rutean por conversationId/workspacePaths. Paridad con
  // src/app/api/terminal/agent-hook/route.js.
  const body = req.body || {};
  const isBridgeReport =
    body &&
    typeof body === 'object' &&
    body.source === ANTIGRAVITY_BRIDGE_SOURCE &&
    !body.terminalId;

  const result = isBridgeReport
    ? handleBridgeHookReport(sessions, body, Date.now(), {
        bridgeToken: getSidecarBridgeToken(),
      })
    : handleHookReport(sessions, body, Date.now());

  if (result.status !== 204) {
    return res.status(result.status).json({ error: result.error });
  }
  if (result.broadcast && result.session?.clients) {
    broadcastSessionPayload(result.session, result.broadcast);
  }
  return res.status(204).send();
});

// Endpoint de shutdown graceful — llamado por Tauri al cerrar la app
app.post('/shutdown', (_req, res) => {
  console.log('[Sidecar] Recibida señal de shutdown graceful...');
  res.json({ ok: true, message: 'Shutting down...' });

  // Dar tiempo a que la respuesta HTTP llegue
  setTimeout(() => {
    // Matar todos los PTY activos (árbol completo — OpenCode/hijos en Windows)
    for (const [id, session] of sessions) {
      killProcessTreeBestEffort(session.ptyProcess?.pid || session.ptyPid);
      try {
        session.ptyProcess?.kill?.();
      } catch (_) {}
      console.log(`[Sidecar] PTY ${id} terminado.`);
    }
    cleanup();
  }, 300);
});

const server = http.createServer(app);

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  // Extraer parámetros de la URL: ?sessionId=xxx&cwd=/path
  const urlParams = new URL(req.url || '/', `http://localhost:${PORT}`).searchParams;
  const sessionId = urlParams.get('sessionId') || 'default';
  const cwd = urlParams.get('cwd') || os.homedir();
  const swarmContext = {
    isSwarmRole: parseBooleanQueryFlag(urlParams.get('isSwarmRole')),
    roleKey: urlParams.get('roleKey') || null,
    launchId: urlParams.get('launchId') || null,
  };
  ws.__devhubTransport = getTransportMode(req.url || '/');

  // El frontend espera este mensaje para decidir si inyectar el comando inicial.
  // En reattach (sesión ya existente) NO se reenvía, porque el PTY puede tener
  // una TUI viva. En sesión fresca el frontend inyecta initialCommand vía WebSocket.
  // Este contrato debe mantenerse en paralelo con src/lib/terminal/ttyServer.js.
  const isReattach = sessions.has(sessionId);
  let session;
  try {
    session = getOrCreateSession(sessionId, cwd, swarmContext);
  } catch (spawnErr) {
    // pty.spawn puede lanzar (carrera conPTY "AttachConsole failed", shell
    // inválido, etc.). Sin este guard la excepción mataba el handler y el
    // cliente quedaba colgado hasta su timeout de 10s, alimentando un loop de
    // reconexión. Respondemos con un frame explícito y cerramos limpio: el
    // cliente reintenta con backoff acotado sobre una conexión nueva.
    const message = String(spawnErr?.message || spawnErr || 'pty spawn failed');
    console.error(`[Sidecar] PTY spawn falló para sesión ${sessionId}:`, message);
    logSidecarEvent('pty-spawn-failed', { sessionId, cwd, error: message });
    sendToClient(ws, { type: 'spawn-error', message });
    try {
      ws.close(1011, 'pty-spawn-failed');
    } catch (_) {}
    return;
  }
  session.clients.add(ws);

  console.log(
    `[Sidecar] WS conectado a sesión ${sessionId} (${session.clients.size} clientes, transport=${ws.__devhubTransport}, reattach=${isReattach})`
  );

  // Replay del historial al reconectar
  if (session.history.length > 0) {
    const replay = buildHistoryReplay(session);
    if (replay) {
      sendToClient(ws, { type: 'output', data: replay });
    }
  }

  // Replay del estado semántico del agente: los frames agent-state solo se
  // emiten en transiciones, así que un cliente que conecta con el estado
  // estable (p.ej. idle/running sostenido) no vería badge hasta el próximo
  // cambio o hasta que el poll HTTP responda.
  if (session.agentTuiState) {
    sendToClient(
      ws,
      buildAgentStateFrame(session, session.agentTuiState, {
        at: session.agentTuiStateAt ?? Date.now(),
      })
    );
  }

  if (session.opencodeSessionId) {
    sendToClient(ws, {
      type: 'opencode-session-detected',
      sessionId: session.opencodeSessionId,
    });
  }

  // Notificar al cliente que la sesión está lista. El frontend usa esto para
  // enviar (o no) el comando inicial. Se envía DESPUÉS del replay para que
  // el historial ya esté escrito antes de que el comando inicial corra.
  sendToClient(ws, {
    type: 'ready',
    reattached: isReattach,
    mode: session?.mode || 'shell',
    lastActivityAgeMs: Date.now() - (session?.lastActivityAt || 0),
  });

  // Reattach de TUI de agente (kimi/grok/opencode): el cliente monta un canvas
  // xterm nuevo y VACÍO — las TUIs apagan historyEnabled, así que el replay de
  // arriba no trae nada y el panel queda negro salvo por output nuevo (p.ej.
  // solo el footer). Pedimos a la app que repinte (Ctrl+L); shells excluidos:
  // Ctrl+L duplicaría el prompt (su history replay sí cubre el reattach).
  // Este contrato debe mantenerse en paralelo con src/lib/terminal/ttyServer.js
  // (_pendingTuiReattachRedraw, que además lo salta cuando hay snapshot v2).
  if (isReattach && session.mode === 'tui') {
    setTimeout(() => {
      try {
        if (!sessions.has(sessionId)) return;
        if (!session.ptyProcess) return;
        session.ptyProcess.write('\x0c'); // Ctrl+L → repintado de la TUI

        // kimi (Ink) solo repinta su status bar con Ctrl+L — verificado en vivo:
        // ~214 bytes vs ~11.5KB de frame completo tras un SIGWINCH real. Un
        // wobble de resize (rows-1 → rows) fuerza el repaint completo del
        // transcript. El resize propio del cliente al conectar ya corrió, así
        // que terminamos de vuelta en las dims reales de la sesión.
        if (session.agentType === 'kimi') {
          const { cols, rows } = session.termsize || {};
          if (Number.isInteger(cols) && Number.isInteger(rows) && rows > 1) {
            session.ptyProcess.resize(cols, rows - 1);
            setTimeout(() => {
              try {
                if (!sessions.has(sessionId)) return;
                if (!session.ptyProcess) return;
                session.ptyProcess.resize(cols, rows);
              } catch (_) {}
            }, 150);
          }
        }
      } catch (_) {}
    }, 250);
  }

  ws.on('message', (msg) => {
    const payload = parseClientMessage(msg, ws.__devhubTransport || 'raw');

    if (payload.type === 'resize' && payload.cols && payload.rows) {
      session.termsize = { cols: payload.cols, rows: payload.rows };
      try {
        session.ptyProcess.resize(payload.cols, payload.rows);
      } catch (_) {}
      return;
    }

    if (payload.type === 'panel-focus') {
      session.inputFocused = payload.focused === true;
      return;
    }

    if (payload.type === 'session-meta') {
      const launch = typeof payload.launchCommand === 'string' ? payload.launchCommand.trim() : '';
      if (launch) session.launchCommand = launch;
      return;
    }

    if (payload.type !== 'input') {
      return;
    }

    const filteredInput = filterTerminalInputForSession(session, payload.data);
    if (filteredInput === null) return;

    // Capture whether the agent was already known BEFORE detection runs.
    // The Enter that launches the agent is not a prompt submission.
    const hadAgentTypeBeforeInput = Boolean(session.agentType);

    updateSessionModeFromInput(session, filteredInput);
    maybeStartAgentSessionBinding(session);

    if (typeof filteredInput === 'string' && filteredInput.length > 0) {
      const isEnter = filteredInput.includes('\r') || filteredInput.includes('\n');
      if (isEnter && session.agentType && hadAgentTypeBeforeInput) {
        const published = notifyUserInput(session);
        if (published && session.agentTuiState) {
          broadcastSessionPayload(session, buildAgentStateFrame(session, session.agentTuiState));
        }
      }
    }

    const detectedSessionId = detectOpenCodeSessionId(filteredInput);
    if (detectedSessionId && session.opencodeSessionId !== detectedSessionId) {
      session.opencodeSessionId = detectedSessionId;
      broadcastSessionPayload(session, {
        type: 'opencode-session-detected',
        sessionId: detectedSessionId,
      });
      logSidecarEvent('agent-session-detected-broadcast', {
        provider: 'opencode',
        sessionId: session.id,
        agentSessionId: detectedSessionId,
        eventType: 'opencode-session-detected',
        origin: 'ws-input',
      });
    }

    // Command-like submissions only (Enter) — keystroke-level input is too
    // noisy for the durable log; this still captures initial-command injects.
    if (typeof filteredInput === 'string' && /[\r\n]/.test(filteredInput)) {
      logSidecarEvent('terminal-input-send', {
        sessionId: session.id,
        command: truncateForLog(filteredInput),
        source: 'ws-input',
      });
    }

    // Input de teclado al PTY
    try {
      session.ptyProcess.write(filteredInput);
    } catch (_) {}
  });

  ws.on('close', () => {
    session.clients.delete(ws);
    console.log(
      `[Sidecar] WS desconectado de sesión ${sessionId} (${session.clients.size} clientes restantes)`
    );
    // IMPORTANTE: NO matamos el PTY aquí — persiste aunque no haya clientes
  });

  ws.on('error', (err) => {
    console.error(`[Sidecar] WS error en sesión ${sessionId}:`, err.message);
    session.clients.delete(ws);
  });
});

// ─── Arrancar servidor ────────────────────────────────────────────────────────
server.on('error', (error) => {
  console.error('[Sidecar] Error de arranque del servidor:', error);
  cleanup(1);
});

server.listen(PORT, '127.0.0.1', () => {
  writeRuntimeFiles();
  writeSidecarHookBridgeConfig();

  // Front E (paridad con ttyServer): suscribirse al bus SSE de OpenCode cuando
  // hay un servidor configurado (DEVHUB_OPENCODE_SSE_URL). Fail-open: si el
  // servidor no está, el cliente reintenta en silencio y el scraping sigue
  // siendo el fallback.
  if (process.env.DEVHUB_OPENCODE_SSE_URL) {
    try {
      const opencodeSse = createOpenCodeSseClient({
        baseUrl: process.env.DEVHUB_OPENCODE_SSE_URL,
        sessions,
        onFrame: (session, frame) => {
          for (const client of session.clients || []) {
            if (client.readyState === WebSocket.OPEN) {
              try {
                client.send(JSON.stringify(frame));
              } catch (_) {}
            }
          }
        },
      });
      opencodeSse.start();
      console.log(`[Sidecar] opencode SSE client → ${process.env.DEVHUB_OPENCODE_SSE_URL}`);
    } catch (sseErr) {
      console.warn('[Sidecar] opencode SSE client FAILED (non-fatal):', sseErr?.message);
    }
  }

  console.log(`[Sidecar] ✅ Sidecar escuchando en http://127.0.0.1:${PORT}`);
  console.log(`[Sidecar]    PID: ${process.pid}`);
  console.log(`[Sidecar]    Shell: ${process.env.SHELL || 'bash'}`);

  logSidecarEvent('sidecar-startup', {
    port: PORT,
    pid: process.pid,
    devhubHome: DEVHUB_DIR,
    agentSessionBinderLoaded: Boolean(agentSessionBinder),
  });

  // Arrancar intervalo de tick para detección de agentes
  const tickMs = Number(process.env.AGENT_DETECTION_TICK_MS || 500);
  setInterval(() => {
    for (const session of sessions.values()) {
      if (session.agentType) {
        const tickResult = tickAgentDetection(session, Date.now());
        if (tickResult.published && session.agentTuiState) {
          const payload = buildAgentStateFrame(session, session.agentTuiState);
          for (const client of session.clients) {
            if (client.readyState === WebSocket.OPEN) {
              try {
                client.send(JSON.stringify(payload));
              } catch (_) {}
            }
          }
        }
      }
    }
  }, tickMs).unref();
});
