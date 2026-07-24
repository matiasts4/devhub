/**
 * Canonical WS `agent-state` frame builder.
 *
 * Single source of truth for the frame shape emitted by both runtimes:
 *   - web/dev server:  src/lib/terminal/ttyServer.js
 *   - desktop sidecar: sidecar-backend/server.js (CJS mirror lives in
 *     sidecar-backend/sessionTransport.js — keep the two in sync)
 *
 * Frame schema (N4/N5 fix):
 *   { type: 'agent-state', agentTuiState, at, agentType?, wasCancelled?, reason? }
 *
 * Optional fields are included ONLY when defined, so legacy consumers that
 * assume `{type, agentTuiState, at}` never see unexpected nulls:
 *   - agentType:    session.agentType (or explicit override) when set.
 *   - wasCancelled: from the detection result. sessionAgentDetector exposes
 *     it on the ingest result (ttyServer stores it on
 *     session._lastAgentStateEvent.wasCancelled); tick/notify publishes have
 *     no detection context, so their frames omit it unless passed explicitly.
 *   - reason:       terminal frames only ('exit' = PTY exited,
 *     'agent-exit' = typed-agent child reaped while shell survived).
 *
 * @param {object|null} session
 * @param {string} state - agentTuiState to publish (e.g. 'idle', 'running', 'blocked')
 * @param {object} [extra]
 * @param {number} [extra.at]
 * @param {string} [extra.agentType] - override (needed when the caller clears
 *   session.agentType before emitting, e.g. exit/reap paths)
 * @param {boolean} [extra.wasCancelled]
 * @param {string} [extra.reason]
 * @returns {object|null} frame, or null when state is falsy
 */
export function buildAgentStateFrame(session, state, extra = {}) {
  if (!state) return null;
  const frame = {
    type: 'agent-state',
    agentTuiState: state,
    at: extra.at ?? session?.agentTuiStateAt ?? Date.now(),
  };
  const agentType = extra.agentType ?? session?.agentType ?? null;
  if (agentType) {
    frame.agentType = agentType;
  }
  const wasCancelled = extra.wasCancelled ?? session?._lastAgentStateEvent?.wasCancelled;
  if (wasCancelled !== undefined && wasCancelled !== null) {
    frame.wasCancelled = Boolean(wasCancelled);
  }
  if (extra.reason) {
    frame.reason = extra.reason;
  }
  return frame;
}
