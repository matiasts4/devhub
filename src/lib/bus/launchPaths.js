/* eslint-env node */
/* eslint-disable no-undef -- CommonJS module used by health route and tests */
/**
 * T-011 — bus helper wiring in the production launch path.
 *
 * Resolves the absolute paths required by `buildAgentLaunchWrapper` so that
 * the bus helper block (`_devhub_chat`, `_devhub_event`, `_devhub_presence`,
 * `_devhub_inbox_check`) is emitted in the agent's bootstrap shell — not
 * the `# Bus helpers skipped (missing busBinaryPath or dbPath)` placeholder.
 *
 * Without this resolution, every agent launched via
 * `src/app/api/agenthub/operations/health/route.js` would lack the bus
 * helpers in their shell, and the T-006 `_devhub_tell_director` shim
 * (which calls `_devhub_chat` internally) would fail at runtime.
 *
 * The two functions are pure (no I/O) so the production caller can be
 * tested in isolation and the failure mode is deterministic.
 */

'use strict';

const path = require('path');
const { resolveDbPath } = require('../db/pathResolver');
const { buildAgentLaunchWrapper } = require('../agentLaunchWrapper.js');

/**
 * Resolve the absolute paths to the devhub-bus binary and the SQLite database.
 *
 * Resolution rules:
 *   - busBinaryPath: `<repoRoot>/devhub-cli/bin/devhub-bus.js`
 *   - dbPath:
 *       1. `env.DEVHUB_DB_PATH` if set (explicit override, may be a path
 *          produced by the test harness or by a packaged standalone build)
 *       2. `resolveDbPath()` — same canonical DB as the app and DevHub MCP
 *          (`~/.devhub-dev/data/devhub.db` in dev, `~/.devhub/data` in prod)
 *
 * @param {object} params
 * @param {string} params.repoRoot - absolute path to the DevHub repo root
 *                                  (typically `process.cwd()` in Next.js
 *                                  server routes)
 * @param {NodeJS.ProcessEnv} [params.env] - env to read; defaults to process.env
 * @returns {{ busBinaryPath: string, dbPath: string }}
 */
function resolveBusHelperPaths({ repoRoot, env } = {}) {
  const root = path.resolve(/*turbopackIgnore: true*/ repoRoot || process.cwd());
  const sourceEnv = env || process.env;
  const dbPath = sourceEnv.DEVHUB_DB_PATH
    ? path.resolve(sourceEnv.DEVHUB_DB_PATH)
    : resolveDbPath({ env: sourceEnv, cwd: root });
  return {
    busBinaryPath: path.join(root, 'devhub-cli', 'bin', 'devhub-bus.js'),
    dbPath,
  };
}

/**
 * Compose the full agent launch wrapper for a single role. This is the
 * production entry point — the caller in
 * `src/app/api/agenthub/operations/health/route.js`'s `buildLaunchCommand`
 * delegates here so that the bus helper block is wired deterministically.
 *
 * When `busBinaryPath` or `dbPath` is missing, `buildAgentLaunchWrapper`
 * falls back to emitting the `# Bus helpers skipped` placeholder, which
 * is the regression symptom T-011 is fixing.
 *
 * @param {object} params
 * @param {string} params.agentId
 * @param {string} params.missionId
 * @param {string} params.role
 * @param {string} params.workspacePath
 * @param {string} [params.workspaceId]
 * @param {string} [params.runId]
 * @param {string} [params.supervisorUrl]
 * @param {string} [params.tmuxSessionName]
 * @param {string} [params.directorTmuxSession]
 * @param {string} [params.bootstrapPrompt]
 * @param {string} [params.innerCommand]
 * @param {string} [params.modelProvider]
 * @param {string} [params.busBinaryPath] - if omitted, the caller forgot the
 *                                          wire-up and the placeholder is emitted
 * @param {string} [params.dbPath] - if omitted, the placeholder is emitted
 * @param {boolean} [params.disableMinimaxMcp] - T-016.3: opt out of
 *   minimax MCP env var injection (for swarm agents).
 * @param {string} [params.projectId] - DevHub project id for MCP context
 * @param {number} [params.inboxPollIntervalSeconds] - inbox-consume poll interval
 * @param {number} [params.tuiReadyGraceMs] - max wait for opencode-ready marker
 * @param {number} [params.preLaunchDelayMs] - stagger worker wrapper OpenCode start (UI attaches at 0)
 * @returns {string} Complete shell wrapper script
 */
function buildLaunchWrapperForRole({
  agentId,
  missionId,
  role,
  workspacePath,
  workspaceId,
  projectId,
  runId,
  supervisorUrl,
  tmuxSessionName,
  directorTmuxSession,
  bootstrapPrompt,
  innerCommand,
  modelProvider,
  busBinaryPath,
  dbPath,
  repoRoot,
  env,
  disableMinimaxMcp,
  inboxPollIntervalSeconds,
  tuiReadyGraceMs,
  preLaunchDelayMs,
}) {
  // T-011 — auto-resolve bus helper paths when the caller hasn't passed
  // them explicitly. This is the primary fix: the production caller in
  // `health/route.js`'s `buildLaunchCommand` used to omit these args,
  // which caused `buildBusHelpersBlock` to emit a `# Bus helpers skipped`
  // placeholder instead of the actual helper functions.
  let resolvedBusBinaryPath = busBinaryPath;
  let resolvedDbPath = dbPath;
  if (!resolvedBusBinaryPath || !resolvedDbPath) {
    const fallback = resolveBusHelperPaths({ repoRoot, env });
    if (!resolvedBusBinaryPath) resolvedBusBinaryPath = fallback.busBinaryPath;
    if (!resolvedDbPath) resolvedDbPath = fallback.dbPath;
  }
  return buildAgentLaunchWrapper({
    agentId,
    missionId,
    role,
    workspacePath,
    workspaceId,
    projectId,
    runId,
    supervisorUrl,
    tmuxSessionName,
    directorTmuxSession,
    bootstrapPrompt,
    innerCommand,
    modelProvider,
    busBinaryPath: resolvedBusBinaryPath,
    dbPath: resolvedDbPath,
    disableMinimaxMcp,
    inboxPollIntervalSeconds,
    tuiReadyGraceMs,
    preLaunchDelayMs,
  });
}

module.exports = {
  resolveBusHelperPaths,
  buildLaunchWrapperForRole,
};
