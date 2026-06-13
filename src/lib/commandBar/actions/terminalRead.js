/**
 * Terminal read action.
 * 
 * Reads the current buffer content of a named terminal and returns it
 * as structured text suitable for display and future TTS consumption.
 * 
 * @module commandBar/actions/terminalRead
 */

import { shapeBufferText } from '../surface/terminalBufferRead.js';

/**
 * Execute terminal-read action.
 * 
 * Given a terminal name, reads its buffer content via the capture API,
 * strips ANSI codes, truncates if needed, and returns a typed result.
 * 
 * Falls back to focused terminal if named terminal not found.
 * 
 * @param {import('../types').ResolvedIntent} intent - Resolved intent with terminalName slot
 * @param {import('../types').SurfaceController} controller - Surface controller for terminal operations
 * @returns {Promise<import('../types').TerminalReadResult>} Structured read result
 */
export async function terminalRead(intent, controller) {
  const { terminalName } = intent.slots || {};

  // Resolve terminal: named → fallback to focused → fail
  let terminal = null;
  let fallbackUsed = false;
  let requestedName = null;

  if (terminalName) {
    terminal = controller.findTerminalByLabel(terminalName);
    if (!terminal) {
      // Fallback to focused terminal
      terminal = controller.focusedTerminal();
      if (terminal) {
        fallbackUsed = true;
        requestedName = terminalName;
      }
    }
  } else {
    // No name provided — use focused terminal
    terminal = controller.focusedTerminal();
  }

  // No terminals available
  if (!terminal) {
    return {
      error: 'No terminals are open',
      text: '',
      terminalName: '',
      timestamp: new Date().toISOString(),
      truncated: false,
    };
  }

  // Capture terminal buffer
  try {
    const rawOutput = await controller.captureTerminal(terminal.id);

    // Shape the buffer (ANSI strip + truncate)
    const { text, truncated } = shapeBufferText(rawOutput, { maxLines: 1000 });

    return {
      text,
      terminalName: terminal.label,
      timestamp: new Date().toISOString(),
      truncated,
      ...(fallbackUsed && { fallbackUsed: true, requestedName }),
    };
  } catch (error) {
    return {
      error: `Failed to read terminal: ${error.message}`,
      text: '',
      terminalName: terminal.label,
      timestamp: new Date().toISOString(),
      truncated: false,
    };
  }
}
