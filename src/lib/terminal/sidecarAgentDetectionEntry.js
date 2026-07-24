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
export {
  handleHookReport,
  handleBridgeHookReport,
  ANTIGRAVITY_BRIDGE_SOURCE,
  ALLOWED_HOOK_STATES,
} from './agentHooks/handleHookReport.js';
export {
  writeHookBridgeConfig,
  readHookBridgeConfig,
  resolveHookBridgeConfigPath,
} from './agentHooks/bridgeConfig.js';
export {
  createOpencodeStatusClient,
  createOpenCodeSseClient,
  OPENCODE_SSE_SOURCE,
} from './opencodeSseClient.js';
