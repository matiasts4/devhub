/**
 * Terminal-run action implementation.
 * 
 * Opens or focuses a native terminal surface and runs the specified command.
 * 
 * @module commandBar/actions/terminalRun
 */

/**
 * Execute a terminal-run action.
 * 
 * @param {import('../types').ResolvedIntent} intent - Resolved intent with terminal-run type
 * @param {import('../types').SurfaceController} controller - Surface controller instance
 * @returns {Promise<{id: string, label: string}>} Terminal surface info
 */
export async function terminalRun(intent, controller) {
  const { command, terminalName } = intent.slots;

  // If terminalName specified, try to find and reuse existing terminal
  if (terminalName) {
    const existing = controller.findTerminalByLabel(terminalName);
    
    if (existing) {
      // Focus existing terminal and send command via /input API
      controller.focusTerminal(existing.id);
      
      // Send command to the terminal session
      const response = await fetch(`/api/terminal/session/${existing.id}/input`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: command + '\r' }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send command to terminal: ${response.statusText}`);
      }

      return existing;
    }

    // Terminal with that name doesn't exist, spawn with label
    return await controller.spawnTerminal({
      label: terminalName,
      initialCommand: command,
    });
  }

  // No terminal name specified, spawn a new terminal
  return await controller.spawnTerminal({
    initialCommand: command,
  });
}
