/**
 * v2 terminal keep-alive (PR5 terminal-load-performance).
 * Default ON: engine-v2 panels stay mounted (hidden) when the workspace tab is
 * hidden — v1 parity, no graveyard stash / WS reconnect on tab switch. The v2
 * graveyard is untouched and remains the memory-pressure / close path.
 * Kill-switch: localStorage.devhub_terminal_keepalive=off
 *
 * Linux WebKitGTK (Tauri) defaults OFF — the fragile offscreen-GPU surface,
 * same platform criterion as terminalWarmPolicy tier3.
 */

import { isLikelyWebKitGtk } from '@/lib/terminal/terminalWarmPolicy';

export const KEEPALIVE_KILL_SWITCH_KEY = 'devhub_terminal_keepalive';

export function readKeepaliveKillSwitch(storage) {
  try {
    return storage?.getItem?.(KEEPALIVE_KILL_SWITCH_KEY) === 'off';
  } catch {
    return false;
  }
}

/**
 * @param {{ platformUa?: string, storage?: Storage|null }} opts
 */
export function resolveTerminalKeepaliveEnabled({
  platformUa = typeof globalThis !== 'undefined' && globalThis.navigator
    ? globalThis.navigator.userAgent
    : '',
  storage = typeof globalThis !== 'undefined' && globalThis.localStorage
    ? globalThis.localStorage
    : null,
} = {}) {
  if (readKeepaliveKillSwitch(storage)) return false;
  return !isLikelyWebKitGtk(platformUa);
}

export function isTerminalKeepaliveEnabled() {
  return resolveTerminalKeepaliveEnabled();
}

/**
 * Pure mount decision for a workspace panel's TerminalTTY.
 * keepaliveEnabled only changes engine-v2 panels: ON keeps them mounted while
 * the workspace shell is hidden (v1 parity); OFF preserves the current
 * graveyard behavior (unmount on workspace tab switch).
 */
export function shouldMountWorkspaceTerminal({
  isEngineV2 = false,
  isWorkspaceShellVisible = true,
  isVisibleInLayout = true,
  keepaliveEnabled = false,
} = {}) {
  if (!isEngineV2) return true;
  if (keepaliveEnabled) return true;
  return Boolean(isWorkspaceShellVisible) || Boolean(isVisibleInLayout);
}
