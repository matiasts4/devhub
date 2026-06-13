/** Fired once per launch with the full runtime_requests payload from the API. */
export const SWARM_LAUNCH_MATERIALIZED_EVENT = 'devhub:swarm-launch-materialized';

/** Idle window after the last swarm runtime request before building the workspace. */
export const SWARM_LAUNCH_BATCH_DEADLINE_MS = 4500;

/**
 * Create all swarm panels in one workspace immediately instead of waiting for
 * staggered `devhub:run-agent` events (which used to flush ZED alone at 4.5s).
 *
 * @param {object[]} runtimeRequests
 */
export function dispatchSwarmLaunchMaterialized(runtimeRequests = []) {
  const browserWindow = typeof globalThis !== 'undefined' ? globalThis.window : undefined;
  if (!browserWindow?.dispatchEvent) return;
  if (!Array.isArray(runtimeRequests) || runtimeRequests.length === 0) return;
  browserWindow.dispatchEvent(
    new CustomEvent(SWARM_LAUNCH_MATERIALIZED_EVENT, {
      detail: { runtimeRequests },
    })
  );
}

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
