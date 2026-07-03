/**
 * ruleEngine — evaluates herdr-style agent-state manifests against a terminal buffer.
 *
 * Supports:
 *   regions: whole_recent, bottom_lines(N), bottom_non_empty_lines(N), osc_title,
 *            after_last_prompt_marker, after_last_horizontal_rule, prompt_box_body
 *   matchers: contains, regex, lineRegex
 *   logic: all, any, not
 *   conflict resolution: highest priority wins
 */

const DEFAULT_REGION = 'whole_recent';

const REGION_SPEC_PATTERN = /^(\w+)\((\d+)\)$/;

function parseRegionSpec(spec) {
  const match = spec.trim().match(REGION_SPEC_PATTERN);
  if (!match) return null;
  return { name: match[1], count: parseInt(match[2], 10) };
}

function sliceFromLineIndex(content, lines, index) {
  const byteOffset = lines
    .slice(0, Math.min(index, lines.length))
    .reduce((sum, line) => sum + line.length + 1, 0);
  return content.slice(Math.min(byteOffset, content.length));
}

function bottomLines(content, count) {
  const lines = content.split('\n');
  const start = Math.max(0, lines.length - count);
  return sliceFromLineIndex(content, lines, start);
}

function bottomNonEmptyLines(content, count) {
  const lines = content.split('\n');
  const indexes = lines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ idx }) => idx);

  if (indexes.length === 0) return '';
  const start = indexes[Math.max(0, indexes.length - count)];
  return sliceFromLineIndex(content, lines, start);
}

function afterLastPromptMarker(content) {
  const lines = content.split('\n');
  const idx = lines.findLastIndex((line) => line === '›' || line.startsWith('› '));
  if (idx === -1) return content;
  return sliceFromLineIndex(content, lines, idx + 1);
}

function isHorizontalRule(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  const chars = [...trimmed];
  let ruleChars = 0;
  for (const ch of chars) {
    if (ch === '─') ruleChars += 1;
    else break;
  }
  if (ruleChars === 0) return false;
  const suffix = trimmed.slice(ruleChars).trimStart();
  return suffix.length === 0 || ruleChars >= 3;
}

function afterLastHorizontalRule(content) {
  const lines = content.split('\n');
  let lastRuleEnd = 0;
  let offset = 0;
  for (const line of lines) {
    const nextOffset = offset + line.length + 1;
    if (isHorizontalRule(line)) {
      lastRuleEnd = Math.min(nextOffset, content.length);
    }
    offset = nextOffset;
  }
  return content.slice(lastRuleEnd);
}

function promptBoxTopBorderIndex(lines) {
  let borderCount = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isHorizontalRule(lines[i])) {
      borderCount += 1;
      if (borderCount === 2) return i;
    }
  }
  return -1;
}

function promptBoxBody(content) {
  const lines = content.split('\n');
  const top = promptBoxTopBorderIndex(lines);
  if (top === -1) return null;

  const startOffset = lines.slice(0, top + 1).reduce((sum, line) => sum + line.length + 1, 0);

  const remaining = lines.slice(top + 1);
  const endRelative = remaining.findIndex((line) => isHorizontalRule(line));
  const endIndex = endRelative === -1 ? lines.length : top + 1 + endRelative;
  const endOffset = lines.slice(0, endIndex).reduce((sum, line) => sum + line.length + 1, 0);

  return content.slice(Math.min(startOffset, content.length), Math.min(endOffset, content.length));
}

export function getRegion(input, spec) {
  const trimmed = spec.trim();

  if (trimmed === 'osc_title') return input.oscTitle || '';

  const content = input.screen || '';

  switch (trimmed) {
    case 'whole_recent':
      return content;
    case 'after_last_prompt_marker':
      return afterLastPromptMarker(content);
    case 'after_last_horizontal_rule':
      return afterLastHorizontalRule(content);
    case 'prompt_box_body': {
      const body = promptBoxBody(content);
      return body === null ? '' : body;
    }
    default: {
      const parsed = parseRegionSpec(trimmed);
      if (parsed) {
        if (parsed.name === 'bottom_lines') return bottomLines(content, parsed.count);
        if (parsed.name === 'bottom_non_empty_lines') {
          return bottomNonEmptyLines(content, parsed.count);
        }
      }
      return content;
    }
  }
}

function compileRegex(pattern) {
  let source = pattern;
  const flags = new Set();

  // Rust/PCRE inline flags used by herdr manifests; JavaScript needs RegExp flags.
  while (source.startsWith('(?')) {
    const close = source.indexOf(')');
    if (close === -1) break;
    const flagGroup = source.slice(2, close);
    for (const ch of flagGroup) {
      if (['i', 'm', 's', 'u'].includes(ch)) flags.add(ch);
    }
    source = source.slice(close + 1);
  }

  try {
    return new RegExp(source, [...flags].join(''));
  } catch (err) {
    throw new Error(`Invalid regex pattern "${pattern}": ${err.message}`);
  }
}

function evaluateMatcher(gate, text, lowerText) {
  if (gate.contains) {
    for (const needle of gate.contains) {
      if (!lowerText.includes(String(needle).toLowerCase())) return false;
    }
  }

  if (gate.regex) {
    for (const pattern of gate.regex) {
      const re = compileRegex(pattern);
      if (!re.test(text)) return false;
    }
  }

  if (gate.lineRegex) {
    const lines = text.split('\n');
    for (const pattern of gate.lineRegex) {
      const re = compileRegex(pattern);
      if (!lines.some((line) => re.test(line))) return false;
    }
  }

  return true;
}

export function evaluateGate(gate, text, lowerText) {
  if (!evaluateMatcher(gate, text, lowerText)) return false;

  if (gate.all && gate.all.length > 0) {
    if (!gate.all.every((nested) => evaluateGate(nested, text, lowerText))) return false;
  }

  if (gate.any && gate.any.length > 0) {
    if (!gate.any.some((nested) => evaluateGate(nested, text, lowerText))) return false;
  }

  if (gate.not && gate.not.length > 0) {
    if (gate.not.some((nested) => evaluateGate(nested, text, lowerText))) return false;
  }

  return true;
}

function ruleToGate(rule) {
  return {
    contains: rule.contains,
    regex: rule.regex,
    lineRegex: rule.lineRegex,
    all: rule.all,
    any: rule.any,
    not: rule.not,
  };
}

export function evaluateManifest(manifest, input) {
  let bestRule = null;

  for (const rule of manifest.rules || []) {
    const regionText = getRegion(input, rule.region || DEFAULT_REGION);
    if (evaluateGate(ruleToGate(rule), regionText, regionText.toLowerCase())) {
      if (!bestRule || (rule.priority || 0) > (bestRule.priority || 0)) {
        bestRule = rule;
      }
    }
  }

  if (!bestRule) {
    return {
      state: 'unknown',
      skipStateUpdate: false,
      visibleIdle: false,
      visibleWorking: false,
      visibleBlocker: false,
      matchedRule: null,
    };
  }

  const state = bestRule.state || 'unknown';
  return {
    state,
    skipStateUpdate: !!bestRule.skipStateUpdate,
    visibleIdle: !!bestRule.visibleIdle && state === 'idle',
    visibleWorking: !!bestRule.visibleWorking && state === 'running',
    visibleBlocker: !!bestRule.visibleBlocker && state === 'blocked',
    matchedRule: {
      id: bestRule.id,
      priority: bestRule.priority || 0,
      region: bestRule.region || DEFAULT_REGION,
      state,
    },
  };
}
