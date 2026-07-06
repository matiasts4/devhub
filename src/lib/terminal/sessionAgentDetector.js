/**
 * sessionAgentDetector — shared herdr-style ingest for ttyServer and sidecar (via CJS bundle).
 */

import { detectAgentState, AgentStateMachine } from './agentTuiMetadata.shared.js';
import {
  extractBottomViewport,
  MAX_DETECTION_BUFFER_CHARS,
  DEFAULT_DETECTION_VIEWPORT_LINES,
} from './extractBottomViewport.js';

/**
 * Attach detection fields to a PTY session object (idempotent).
 */
export function ensureAgentDetectionSession(session) {
  if (!session) return session;
  if (!session.agentStateMachine) {
    session.agentStateMachine = new AgentStateMachine();
  }
  if (session.detectionBuffer === undefined) {
    session.detectionBuffer = '';
  }
  if (session.oscProgress === undefined) {
    session.oscProgress = '';
  }
  return session;
}

/**
 * Run manifest detection on filtered PTY output chunk.
 *
 * @returns {{ published: object|null, agentTuiState: string|null, agentTuiStateAt: number|null }}
 */
export function ingestAgentDetectionFromFilteredOutput(session, filtered, now = Date.now()) {
  ensureAgentDetectionSession(session);

  const result = {
    published: null,
    agentTuiState: session.agentTuiState ?? null,
    agentTuiStateAt: session.agentTuiStateAt ?? null,
  };

  if (!session.agentType || !session.agentStateMachine) {
    return result;
  }

  if (typeof filtered !== 'string' || !filtered) {
    return result;
  }

  session.detectionBuffer = (session.detectionBuffer || '') + filtered;
  if (session.detectionBuffer.length > MAX_DETECTION_BUFFER_CHARS) {
    session.detectionBuffer = session.detectionBuffer.slice(-MAX_DETECTION_BUFFER_CHARS);
  }

  const screen = extractBottomViewport(session.detectionBuffer, {
    maxLines: session.detectionViewportLines || DEFAULT_DETECTION_VIEWPORT_LINES,
  });

  const detected = detectAgentState(session.agentType, screen, {
    oscTitle: session.title || '',
    oscProgress: session.oscProgress || '',
  });

  if (detected.skipStateUpdate) {
    return result;
  }

  const published = session.agentStateMachine.publish(detected, now);
  if (published) {
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
    result.published = published;
    result.agentTuiState = published.state;
    result.agentTuiStateAt = now;
  }

  return result;
}
