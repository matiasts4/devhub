/**
 * executeQuickAction — run a predefined quick action.
 *
 * Maps a registry action to the correct workspace event using the sanctioned
 * dispatch helpers (ZEB-005). These events are consumed by
 * `useZedWorkspaceEvents` (TerminalWorkspacesManager) and work in BOTH normal
 * workspace mode and pizarra mode — in pizarra the opened panel becomes a
 * live canvas surface and `pizarra:arrange-fit` re-flows the layout.
 *
 * @module quickActions/executeQuickAction
 */

import { dispatchZedOpenTerminal } from '@/components/zedOpenTerminalEvent';
import { dispatchZedOpenUrl } from '@/components/zedOpenUrlEvent';
import { applyAgentYoloToCommand } from '@/lib/terminal/agentLaunchPreferences';

/**
 * Execute a quick action.
 *
 * Agent terminals (kimi, grok, agy, etc.) are automatically launched with the
 * user's configured yolo/elevated-permissions flag when enabled in the Agentes
 * settings section.
 *
 * @param {Object} action - A registry action ({ type, command?, url?, label }).
 * @param {Object} [options]
 * @param {string|null} [options.cwd] - Working directory for terminal spawns.
 * @returns {boolean} True when an event was dispatched, false otherwise.
 */
export function executeQuickAction(action, { cwd = null } = {}) {
  if (!action || typeof action !== 'object') return false;

  if (action.type === 'terminal') {
    // Apply yolo flag if the user has enabled elevated permissions for this agent.
    const rawCommand = typeof action.command === 'string' ? action.command : null;
    const command = rawCommand ? applyAgentYoloToCommand(rawCommand) : null;

    dispatchZedOpenTerminal({
      command,
      cwd,
      // focus:false → open as a normal split panel. `focus:true` would put the
      // panel into zen/focus mode (fullscreen, hiding every other panel), which
      // is not what a quick action wants. The panel is still activated and gets
      // keyboard input via activateWorkspacePanel → autoFocus.
      focus: false,
      displayName: action.label || null,
    });
    return true;
  }

  if (action.type === 'browser') {
    dispatchZedOpenUrl({
      url: action.url,
      label: action.label || null,
      focus: true,
    });
    return true;
  }

  return false;
}
