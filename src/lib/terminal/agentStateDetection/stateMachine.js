/**
 * stateMachine — anti-flicker state arbitration for agent TUI detection.
 *
 * Adapted from herdr's pending-idle / visible-signal logic.
 *
 * Exported states intentionally mirror the vocabulary used by the rest of
 * DevHub: 'idle' | 'running' | 'blocked' | 'unknown'.
 */

const PENDING_IDLE_CAP_MS = 4000;
const PENDING_IDLE_CONFIRMATIONS = 6;
const STABLE_VISIBLE_SIGNAL_REFRESH_MS = 800;

export class AgentStateMachine {
  constructor() {
    this.state = 'unknown';
    this.lastVisibleIdle = false;
    this.lastVisibleBlocker = false;
    this.lastVisibleWorking = false;
    this.lastVisibleSignalRefresh = null;
    this.pendingIdle = null;
  }

  /**
   * Avoid flickering from running → idle on transient pauses.
   * Holds the transition until confirmed several times or a cap expires.
   */
  shouldHoldWorkingToIdle(previous, next, now) {
    const isWorkingToPlainIdle =
      previous.state === 'running' &&
      next.state === 'idle' &&
      !next.visibleIdle &&
      !next.visibleBlocker;

    if (!isWorkingToPlainIdle) {
      this.pendingIdle = null;
      return false;
    }

    if (!this.pendingIdle) {
      this.pendingIdle = { startedAt: now, confirmations: 0 };
      return true;
    }

    if (now - this.pendingIdle.startedAt >= PENDING_IDLE_CAP_MS) {
      this.pendingIdle = null;
      return false;
    }

    this.pendingIdle.confirmations += 1;
    if (this.pendingIdle.confirmations >= PENDING_IDLE_CONFIRMATIONS) {
      this.pendingIdle = null;
      return false;
    }

    return true;
  }

  /**
   * Periodically refresh a stable visible blocker so consumers keep noticing it.
   */
  stableVisibleSignalRefreshDue(next, now) {
    const stableVisibleSignal =
      (next.visibleBlocker && this.lastVisibleBlocker) ||
      (next.visibleWorking && this.lastVisibleWorking);
    if (!stableVisibleSignal) return false;
    if (this.lastVisibleSignalRefresh === null) return true;
    return now - this.lastVisibleSignalRefresh >= STABLE_VISIBLE_SIGNAL_REFRESH_MS;
  }

  /**
   * Directly publish a hook state report, bypassing anti-flicker hold.
   */
  publishHook(detection, now = Date.now()) {
    this.pendingIdle = null;
    return this.publish(detection, now, { bypassHold: true });
  }

  /**
   * Consume a detection result and optionally return a published state change.
   *
   * @param {object} detection
   * @param {string} detection.state — 'idle' | 'running' | 'blocked' | 'unknown'
   * @param {boolean} detection.visibleIdle
   * @param {boolean} detection.visibleWorking
   * @param {boolean} detection.visibleBlocker
   * @param {number} now — timestamp in ms
   * @param {object} [options]
   * @param {boolean} [options.bypassHold] — skip anti-flicker hold (used for authoritative hooks)
   * @returns {object|null} published state or null if unchanged
   */
  publish(detection, now = Date.now(), options = {}) {
    // 'unknown' detections are non-evidence (W4): they must never publish a
    // state change, never confirm a pending running→idle transition, and never
    // cancel it either. The previous stable state stays sticky. Authoritative
    // hook reports (bypassHold) always carry concrete idle/running/blocked
    // states, so they are unaffected.
    if (detection.state === 'unknown' && !options.bypassHold) {
      return null;
    }

    const next = {
      state: detection.state,
      visibleIdle: detection.visibleIdle,
      visibleWorking: detection.visibleWorking,
      visibleBlocker: detection.visibleBlocker,
    };

    const previous = {
      state: this.state,
      visibleIdle: this.lastVisibleIdle,
      visibleWorking: this.lastVisibleWorking,
      visibleBlocker: this.lastVisibleBlocker,
    };

    if (!options.bypassHold && this.shouldHoldWorkingToIdle(previous, next, now)) {
      return null;
    }

    const stableRefreshDue = this.stableVisibleSignalRefreshDue(next, now);

    const unchanged =
      previous.state === next.state &&
      previous.visibleIdle === next.visibleIdle &&
      previous.visibleWorking === next.visibleWorking &&
      previous.visibleBlocker === next.visibleBlocker;

    if (unchanged && !stableRefreshDue) {
      return null;
    }

    this.state = next.state;
    this.lastVisibleIdle = next.visibleIdle;
    this.lastVisibleWorking = next.visibleWorking;
    this.lastVisibleBlocker = next.visibleBlocker;
    this.lastVisibleSignalRefresh = next.visibleBlocker || next.visibleWorking ? now : null;

    return next;
  }
}
