/**
 * T1.4 / R-PERF-4 — Drop WS connect stagger.
 *
 * The WIP test asserted 5 simultaneous connect() calls reach `open`
 * within 200ms total. The prior default of `SWARM_CONNECT_STAGGER_MS = 300`
 * serialized the 5 handshakes (5 × 300ms = 1.5s). R-PERF-4 reduces
 * the stagger to 0; the OS event loop fairness is sufficient for
 * 5 simultaneous handshakes.
 *
 * The module keeps its public surface (scheduleSwarmTerminalConnect,
 * resetSwarmTerminalConnectStaggerForTests) for back-compat with the
 * existing call sites in `src/components/TerminalTTY.jsx`.
 */

/** R-PERF-4: connect stagger reduced to 0 — 5 handshakes are
 *  serialized through the OS event loop, not through this module. */
export const SWARM_CONNECT_STAGGER_MS = 0;

let swarmConnectChain = Promise.resolve();

/**
 * Serialize swarm panel WebSocket handshakes so six panels do not open
 * simultaneous connections to the same host (browser per-host limits).
 *
 * With `SWARM_CONNECT_STAGGER_MS = 0`, the chain is a no-op: each
 * call returns a microtask-resolved promise. The original
 * back-compat contract is preserved — call sites do not need to
 * change.
 */
export function scheduleSwarmTerminalConnect(task) {
  const run = swarmConnectChain.then(() => task());
  swarmConnectChain = run.then(
    () => new Promise((resolve) => setTimeout(resolve, SWARM_CONNECT_STAGGER_MS)),
    () => new Promise((resolve) => setTimeout(resolve, SWARM_CONNECT_STAGGER_MS))
  );
  return run;
}

export function resetSwarmTerminalConnectStaggerForTests() {
  swarmConnectChain = Promise.resolve();
}

export default {
  SWARM_CONNECT_STAGGER_MS,
  scheduleSwarmTerminalConnect,
  resetSwarmTerminalConnectStaggerForTests,
};
