/**
 * Phase 0 removed the GTK native VTE backend; these no-ops keep teardown and
 * legacy code paths callable without branching on undefined.
 */
export const NATIVE_VTE_STUBS = Object.freeze({
  setNativeVtePanelVisibility: async () => {},
  openNativeVtePanel: async () => ({ opened: false, reason: 'vte-removed' }),
  closeNativeVtePanel: async () => {},
  resizeNativeVtePanel: async () => {},
  focusNativeVtePanel: async () => {},
  pasteNativeVtePanel: async () => ({ supported: false, reason: 'vte-removed' }),
  subscribeNativeVteEvents: () => () => {},
  probeNativeVte: async () => ({ ready: false, reason: 'vte-removed' }),
  shouldOpenNativeVtePanel: () => false,
});
