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
// A value is everything after the first `=` up to the next newline. A
// single matched pair of leading and trailing `"` or `'` is stripped.
// `PARAM:` directives that appear before any `TOOL:` are ignored (no
// association). Each `TOOL:` produces exactly one call, even when the
// block has no `PARAM:` lines.
//
// Boundary rules (T-019):
//   `TOOL:` and `PARAM:` are recognized when preceded by one of:
//     - start of input
//     - whitespace
//     - `.` (sentence end — model frequently glues `TOOL:` after prose)
//     - `\n`
//   Mid-word occurrences (e.g. `xxxTOOL: foo`) are NOT treated as calls
//   and the parser will silently skip them. Surfacing that as a real
//   diagnostic is a future enhancement; for now the goal is to stop
//   silently dropping the common dot-glued case.
//
// Returns: array of `{ name, input }` where `input` is an object of
// key→value strings. Empty values are preserved as empty strings.

const TOOL_OR_PARAM_RE = /(?<=^|[\s.])TOOL:\s*(\w+)\b|(?<=^|[\s.])PARAM:\s*(\w+)\s*=\s*([^\n]*)/g;

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

  const text = String(rawText ?? '');
  // Reset lastIndex defensively in case the same regex is reused across
  // calls (g flag preserves state).
  TOOL_OR_PARAM_RE.lastIndex = 0;

  let match;
  while ((match = TOOL_OR_PARAM_RE.exec(text)) !== null) {
    if (match[1] !== undefined) {
      // TOOL branch — group 1 is the tool name.
      current = { name: match[1], input: {} };
      calls.push(current);
    } else if (current) {
      // PARAM branch — group 2 is the key, group 3 is the raw value.
      current.input[match[2]] = stripQuotes(match[3].trim());
    }
    // PARAM without a preceding TOOL is dropped by design.
  }

  return calls;
}

export { parseToolCalls };
