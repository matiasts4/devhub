/**
 * dispatchPlanningAgentRun — planning-launch-hardening Fase 4.
 *
 * Reliable dispatch helper for the planning-agent launch. Emits a
 * `devhub:run-agent` CustomEvent synchronously on the first try, then
 * retries every RETRY_MS up to MAX_ATTEMPTS total until a matching
 * `devhub:run-agent-accepted` ack arrives.
 *
 * Spec (per `openspec/changes/planning-launch-hardening/design.md` Decision 1
 * and tasks.md §4.1 / 4.2):
 *   - Retry queue, no coupling to the listener's mount timing.
 *   - Ack contract: `detail: { taskId? }`. A matching taskId OR a no-taskId
 *     ack stops the loop. (The detail's `taskId` is the dispatcher's input
 *     `detail.taskId` — by default the planning path's `projectId`.)
 *   - On MAX_ATTEMPTS exhausted, log a Spanish warning and return
 *     `{ accepted: false, attempts: 20 }`. Never throw — the user can
 *     retry manually from `/terminales`.
 *   - SSR / test safe: read the event target off `globalThis` (not `window`)
 *     so the bare-Jest `node` test environment does not crash.
 *   - Optional `opts.eventTarget` lets tests pass a custom dispatcher.
 *
 * @param {{
 *   command: string,
 *   launchOrigin: string,
 *   projectId?: string,
 *   taskId?: string,
 *   selectedAgent?: string,
 *   promptSummary?: string,
 * }} detail
 * @param {{ MAX_ATTEMPTS?: number, RETRY_MS?: number, eventTarget?: any }} [opts]
 * @returns {Promise<{ accepted: boolean, attempts: number }>}
 */

export const MAX_ATTEMPTS = 20;
export const RETRY_MS = 100;

const RUN_AGENT_EVENT = 'devhub:run-agent';
const ACK_EVENT = 'devhub:run-agent-accepted';

function resolveEventTarget(optsTarget) {
  if (optsTarget) return optsTarget;
  const g = /** @type {any} */ (globalThis);
  return g.window || g;
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (timer && typeof timer.unref === 'function') timer.unref();
  });
}

export async function dispatchPlanningAgentRun(detail, opts = {}) {
  const maxAttempts = Number.isFinite(opts.MAX_ATTEMPTS) ? opts.MAX_ATTEMPTS : MAX_ATTEMPTS;
  const retryMs = Number.isFinite(opts.RETRY_MS) ? opts.RETRY_MS : RETRY_MS;
  const target = resolveEventTarget(opts.eventTarget);

  // Edge case: no event target available (pure SSR / test env without a window).
  // Fall back to a no-op target so the helper still resolves deterministically.
  const safeTarget =
    target && typeof target.dispatchEvent === 'function' && typeof target.addEventListener === 'function'
      ? target
      : { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };

  const CustomEventCtor = safeTarget.CustomEvent || globalThis.CustomEvent;
  if (typeof CustomEventCtor !== 'function') {
    // No way to build an event — bail out cleanly.
    return { accepted: false, attempts: 0 };
  }

  const expectedTaskId = detail?.taskId;

  return new Promise((resolve) => {
    let attempts = 0;
    let settled = false;
    const ackHandlers = [];

    const cleanup = () => {
      if (ackHandlers.length > 0) {
        for (const h of ackHandlers) {
          try {
            safeTarget.removeEventListener(ACK_EVENT, h);
          } catch {
            // ignore — test stubs may be partial
          }
        }
        ackHandlers.length = 0;
      }
    };

    const onAck = (event) => {
      if (settled) return;
      const ackTaskId = event?.detail?.taskId;
      // Match by taskId when one was provided; otherwise any ack stops the loop.
      const matches = expectedTaskId == null || ackTaskId == null || ackTaskId === expectedTaskId;
      if (!matches) return;
      settled = true;
      cleanup();
      resolve({ accepted: true, attempts });
    };

    safeTarget.addEventListener(ACK_EVENT, onAck);
    ackHandlers.push(onAck);

    const dispatchOnce = () => {
      if (settled) return;
      attempts += 1;
      try {
        safeTarget.dispatchEvent(
          new CustomEventCtor(RUN_AGENT_EVENT, { detail })
        );
      } catch {
        // Listener may throw in a test stub; keep going up to the cap.
      }
    };

    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!accepted) {
        // Spanish message — the launch is best-effort and the user can retry.
        try {
          console.warn(
            `[planning-launch] devhub:run-agent sin acuse de recibo despues de ${attempts} intentos. Reintentá manualmente desde la lista de terminales.`
          );
        } catch {
          // ignore — console may be stubbed
        }
      }
      resolve({ accepted, attempts });
    };

    const run = async () => {
      for (let i = 0; i < maxAttempts; i += 1) {
        if (settled) return;
        dispatchOnce();
        if (settled) return;
        // Yield to the event loop so listeners (and the ack they dispatch) can
        // run before we try again.
        await sleep(retryMs);
        if (settled) return;
      }
      finish(false);
    };

    run();
  });
}
