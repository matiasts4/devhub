/**
 * Terminal buffer read and shaping utilities.
 * 
 * Provides ANSI stripping, truncation, and structured result shaping
 * for terminal buffer reads via the capture API.
 * 
 * @module commandBar/surface/terminalBufferRead
 */

/**
 * Strip ANSI escape codes from terminal output.
 * 
 * Removes:
 * - CSI sequences (colors, cursor movement, etc): ESC [ ... m/H/J/K/etc
 * - OSC sequences (window title, etc): ESC ] ... BEL
 * 
 * @param {string} text - Raw terminal output with ANSI codes
 * @returns {string} Plain text without ANSI codes
 */
function stripAnsi(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return (
    text
      // Strip CSI sequences: ESC [ ... (letter)
      // Matches: ESC [ <params> <intermediate> <final>
      // Examples: \x1B[31m (color), \x1B[2J (clear), \x1B[H (cursor home)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '')
      
      // Strip OSC sequences: ESC ] ... BEL
      // Examples: \x1B]0;title\x07 (window title)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1B\].*?\x07/g, '')
      
      // Strip other escape sequences (less common)
      // OSC with ST terminator: ESC ] ... ESC \
      // eslint-disable-next-line no-control-regex
      .replace(/\x1B\].*?\x1B\\/g, '')
  );
}

/**
 * Shape raw terminal buffer text for CommandBar display.
 * 
 * - Strips ANSI escape codes
 * - Truncates to last N lines if buffer is large
 * - Returns structured result with truncation flag
 * 
 * @param {string} rawOutput - Raw terminal output from capture API
 * @param {Object} opts - Options
 * @param {number} opts.maxLines - Maximum lines to return (keeps last N lines)
 * @returns {{ text: string; truncated: boolean }} Shaped buffer result
 */
export function shapeBufferText(rawOutput, opts = {}) {
  const { maxLines = 1000 } = opts;

  // Strip ANSI codes first
  const plainText = stripAnsi(rawOutput);

  // Split into lines
  const lines = plainText.split('\n');

  // Truncate if needed
  if (lines.length > maxLines) {
    const truncatedLines = lines.slice(-maxLines);
    return {
      text: truncatedLines.join('\n'),
      truncated: true,
    };
  }

  return {
    text: plainText,
    truncated: false,
  };
}
