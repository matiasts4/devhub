/** Idle window after the last swarm runtime request before building the workspace. */
export const SWARM_LAUNCH_BATCH_DEADLINE_MS = 4500;

/**
 * (Re)schedule batch flush so staggered `devhub:run-agent` events coalesce into
 * one workspace instead of flushing after the first agent only.
 *
 * @param {object} params
 * @param {number|null|undefined} params.existingTimerId
 * @param {() => void} params.onFlush
 * @param {typeof clearTimeout} [params.clearTimeoutFn]
 * @param {typeof setTimeout} [params.setTimeoutFn]
 * @param {number} [params.deadlineMs]
 * @returns {number} timer id
 */
export function rescheduleSwarmLaunchBatchFlush({
  existingTimerId,
  onFlush,
  clearTimeoutFn = clearTimeout,
  setTimeoutFn = setTimeout,
  deadlineMs = SWARM_LAUNCH_BATCH_DEADLINE_MS,
}) {
  if (existingTimerId != null) {
    clearTimeoutFn(existingTimerId);
  }
  return setTimeoutFn(onFlush, deadlineMs);
}
