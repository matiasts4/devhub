// parseToolCalls — converts the model's textual tool-call output into
// structured calls. Grammar (per D1 in design.md):
//
//   TOOL: <name>
//   PARAM: <key>=<value>
//   PARAM: <key>=<value>
//   ...
//   TOOL: <name2>
//   ...
//
// A value is everything after the first `=`. A single matched pair of leading
// and trailing `"` or `'` is stripped. `PARAM:` lines that appear before any
// `TOOL:` are ignored (no association). Each `TOOL:` block produces exactly
// one call, even when the block has no `PARAM:` lines.
//
// Returns: array of `{ name, input }` where `input` is an object of key→value
// strings. Empty values are preserved as empty strings (not dropped).

const TOOL_RE = /^TOOL:\s*(\w+)\s*$/i;
const PARAM_RE = /^PARAM:\s*(\w+)\s*=\s*(.*)$/i;

function stripQuotes(s) {
  if (typeof s !== 'string' || s.length < 2) return s;
  const first = s[0];
  const last = s[s.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return s.slice(1, -1);
  }
  return s;
}

function parseToolCalls(rawText) {
  const calls = [];
  let current = null;
  for (const line of String(rawText ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const tm = TOOL_RE.exec(trimmed);
    if (tm) {
      current = { name: tm[1], input: {} };
      calls.push(current);
      continue;
    }

    const pm = PARAM_RE.exec(trimmed);
    if (pm && current) {
      current.input[pm[1]] = stripQuotes(pm[2].trim());
    }
  }
  return calls;
}

export { parseToolCalls };
