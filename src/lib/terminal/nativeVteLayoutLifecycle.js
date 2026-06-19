/**
 * Native VTE layout lifecycle — defer/cancel layout hides across React unmount/remount.
 *
 * Window/view switches unmount TerminalTTY and remount it immediately. A fire-and-forget
 * hide IPC from the old instance can land after the new instance shows → blank/partial panel.
 */

const pendingLayoutHideTimers = new Map();
const hiddenNativeLeases = new Set();

export function deferNativeVteLayoutHide(panelId, hideFn, delayMs = 48) {
  if (!panelId || typeof hideFn !== 'function') return;
  cancelNativeVteLayoutHide(panelId);
  const timer = setTimeout(() => {
    pendingLayoutHideTimers.delete(panelId);
    hiddenNativeLeases.add(panelId);
    hideFn();
  }, delayMs);
  pendingLayoutHideTimers.set(panelId, timer);
}

export function cancelNativeVteLayoutHide(panelId) {
  const timer = pendingLayoutHideTimers.get(panelId);
  if (!timer) return false;
  clearTimeout(timer);
  pendingLayoutHideTimers.delete(panelId);
  return true;
}

export function markNativeVteLeaseHidden(panelId) {
  if (panelId) hiddenNativeLeases.add(panelId);
}

export function clearNativeVteLease(panelId) {
  if (!panelId) return;
  cancelNativeVteLayoutHide(panelId);
  hiddenNativeLeases.delete(panelId);
}

export function hasHiddenNativeVteLease(panelId) {
  return Boolean(panelId && hiddenNativeLeases.has(panelId));
}

export function consumeHiddenNativeVteLease(panelId) {
  if (!panelId || !hiddenNativeLeases.has(panelId)) return false;
  hiddenNativeLeases.delete(panelId);
  return true;
}

/** Test seam */
export function _resetNativeVteLayoutLifecycleForTests() {
  for (const timer of pendingLayoutHideTimers.values()) {
    clearTimeout(timer);
  }
  pendingLayoutHideTimers.clear();
  hiddenNativeLeases.clear();
}
