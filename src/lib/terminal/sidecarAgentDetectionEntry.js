/**
 * esbuild entry — bundled to sidecar-backend/bundled/agentDetection.cjs
 */
export {
  ensureAgentDetectionSession,
  ingestAgentDetectionFromFilteredOutput,
  notifyUserInput,
  tickAgentDetection,
  HOOK_AUTHORITY_TTL_MS,
  hasFreshHookAuthority,
} from './sessionAgentDetector.js';
export { processOscTitle, stripOscTitleSequences } from './oscTitleParser.js';
export { processOscProgress } from './oscProgressParser.js';
export { buildSessionHookEnv, generateSessionHookToken } from './agentHooks/hookEnv.js';
export { handleHookReport, ALLOWED_HOOK_STATES } from './agentHooks/handleHookReport.js';
