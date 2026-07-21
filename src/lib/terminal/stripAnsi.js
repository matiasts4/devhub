/**
 * stripAnsi — sanitizes terminal output buffer before evaluating agent detection rules.
 * Strips SGR/CSI, DCS, APC, PM, OSC sequences, erase codes, and carriage return (\r).
 */
export function stripAnsi(text) {
  if (typeof text !== 'string') return '';
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /\x1b\[[0-9;?]*[a-zA-Z]|\x1bP[\s\S]*?(?:\x1b\\|\x07)|\x1b_[\s\S]*?(?:\x1b\\|\x07)|\x1b\^[\s\S]*?(?:\x1b\\|\x07)|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\r/g,
    ''
  );
}
