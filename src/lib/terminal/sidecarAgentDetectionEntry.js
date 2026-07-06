/**
 * esbuild entry — bundled to sidecar-backend/bundled/agentDetection.cjs
 */
export {
  ensureAgentDetectionSession,
  ingestAgentDetectionFromFilteredOutput,
} from './sessionAgentDetector.js';
export { processOscTitle, stripOscTitleSequences } from './oscTitleParser.js';
export { processOscProgress } from './oscProgressParser.js';
