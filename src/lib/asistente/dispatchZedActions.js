/**
 * Unified client dispatch for Zed tool results (Phase 2).
 */

import { dispatchZedOpenTerminal } from '@/components/zedOpenTerminalEvent';
import { dispatchZedOpenUrlFromToolResults } from '@/components/zedOpenUrlEvent';
import { dispatchZedCloseFromToolResults } from '@/components/zedCloseSurfaceEvent';
import { dispatchZedTerminalInputFromToolResults } from '@/components/zedTerminalInputEvent';
import {
  MAX_ZED_TERMINAL_PANELS,
  isWorkspaceTerminalPanelLimitReached,
} from '@/lib/terminal/workspaceTerminalLimits';
import { zedClientDebug } from './zedClientDebug';

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Dispatch all open_terminal successes from tool results.
 *
 * @param {Array<{ tool: string, result: unknown }>|null|undefined} toolResults
 * @param {object} opts
 * @param {() => number} [opts.getTerminalPanelCount]
 * @param {Set<string>} [opts.dispatchedKeys]
 * @returns {number}
 */
export function dispatchZedOpenTerminalFromToolResults(
  toolResults,
  { getTerminalPanelCount = null, dispatchedKeys = null } = {}
) {
  if (!Array.isArray(toolResults)) return 0;
  let count = 0;
  const keys = dispatchedKeys || new Set();

  for (const entry of toolResults) {
    if (!entry || entry.tool !== 'open_terminal') continue;
    const raw = entry.result;
    const parsed = typeof raw === 'string' ? safeParse(raw) : raw;
    if (!parsed || parsed.error) {
      zedClientDebug('dispatch_skipped', { tool: 'open_terminal', reason: parsed?.error || 'invalid' });
      continue;
    }

    const currentPanelCount =
      typeof getTerminalPanelCount === 'function' ? Number(getTerminalPanelCount()) || 0 : 0;
    if (isWorkspaceTerminalPanelLimitReached(currentPanelCount, MAX_ZED_TERMINAL_PANELS)) {
      zedClientDebug('dispatch_skipped', { tool: 'open_terminal', reason: 'panel_limit' });
      continue;
    }

    const isWorkspaceOpen = parsed?.workspace === true || parsed?.opened === true;
    if (!isWorkspaceOpen && !parsed?.session_id) {
      zedClientDebug('dispatch_skipped', { tool: 'open_terminal', reason: 'no_session' });
      continue;
    }

    const commandToRun =
      (typeof parsed?.command_sent === 'string' && parsed.command_sent) ||
      (typeof parsed?.command === 'string' && parsed.command) ||
      null;
    const terminalId =
      typeof parsed?.terminalId === 'string' && parsed.terminalId.length > 0
        ? parsed.terminalId
        : null;
    const displayName =
      typeof parsed?.displayName === 'string' && parsed.displayName.length > 0
        ? parsed.displayName
        : null;
    const dispatchKey = isWorkspaceOpen
      ? `ws:${terminalId || ''}:${commandToRun || ''}:${parsed?.cwd || ''}:${displayName || ''}`
      : parsed.session_id;

    if (keys.has(dispatchKey)) {
      zedClientDebug('dispatch_skipped', { tool: 'open_terminal', reason: 'dedup', dispatchKey });
      continue;
    }
    keys.add(dispatchKey);

    dispatchZedOpenTerminal({
      command: commandToRun,
      cwd: parsed?.cwd || null,
      workspace: isWorkspaceOpen,
      session_id: isWorkspaceOpen ? terminalId : parsed.session_id,
      terminalId,
      displayName,
      program: typeof parsed?.program === 'string' ? parsed.program : null,
      focus: parsed.focus !== false,
    });
    zedClientDebug('client_dispatch', { tool: 'open_terminal', terminalId, displayName });
    count += 1;
  }
  return count;
}

/**
 * @param {Array<{ tool: string, result: unknown, input?: object }>|null|undefined} toolResults
 * @param {object} [opts]
 */
export function dispatchAllZedToolResults(toolResults, opts = {}) {
  if (!Array.isArray(toolResults)) return;
  dispatchZedOpenUrlFromToolResults(toolResults);
  dispatchZedOpenTerminalFromToolResults(toolResults, opts);
  dispatchZedCloseFromToolResults(toolResults);
  dispatchZedTerminalInputFromToolResults(toolResults);
}

export default dispatchAllZedToolResults;
