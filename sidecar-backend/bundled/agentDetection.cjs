var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/terminal/sidecarAgentDetectionEntry.js
var sidecarAgentDetectionEntry_exports = {};
__export(sidecarAgentDetectionEntry_exports, {
  ALLOWED_HOOK_STATES: () => ALLOWED_HOOK_STATES,
  ANTIGRAVITY_BRIDGE_SOURCE: () => ANTIGRAVITY_BRIDGE_SOURCE,
  HOOK_AUTHORITY_TTL_MS: () => HOOK_AUTHORITY_TTL_MS,
  OPENCODE_SSE_SOURCE: () => OPENCODE_SSE_SOURCE,
  buildSessionHookEnv: () => buildSessionHookEnv,
  createOpenCodeSseClient: () => createOpenCodeSseClient,
  createOpencodeStatusClient: () => createOpencodeStatusClient,
  ensureAgentDetectionSession: () => ensureAgentDetectionSession,
  generateSessionHookToken: () => generateSessionHookToken,
  handleBridgeHookReport: () => handleBridgeHookReport,
  handleHookReport: () => handleHookReport,
  hasFreshHookAuthority: () => hasFreshHookAuthority,
  ingestAgentDetectionFromFilteredOutput: () => ingestAgentDetectionFromFilteredOutput,
  notifyUserInput: () => notifyUserInput,
  processOscProgress: () => processOscProgress,
  processOscTitle: () => processOscTitle,
  readHookBridgeConfig: () => readHookBridgeConfig,
  resolveHookBridgeConfigPath: () => resolveHookBridgeConfigPath,
  stripOscTitleSequences: () => stripOscTitleSequences,
  tickAgentDetection: () => tickAgentDetection,
  writeHookBridgeConfig: () => writeHookBridgeConfig
});
module.exports = __toCommonJS(sidecarAgentDetectionEntry_exports);

// src/lib/terminal/agentStateDetection/ruleEngine.js
var DEFAULT_REGION = "whole_recent";
var REGION_SPEC_PATTERN = /^(\w+)\((\d+)\)$/;
function parseRegionSpec(spec) {
  const match = spec.trim().match(REGION_SPEC_PATTERN);
  if (!match) return null;
  return { name: match[1], count: parseInt(match[2], 10) };
}
function sliceFromLineIndex(content, lines, index) {
  const byteOffset = lines.slice(0, Math.min(index, lines.length)).reduce((sum, line) => sum + line.length + 1, 0);
  return content.slice(Math.min(byteOffset, content.length));
}
function bottomLines(content, count) {
  const lines = content.split("\n");
  const start = Math.max(0, lines.length - count);
  return sliceFromLineIndex(content, lines, start);
}
function bottomNonEmptyLines(content, count) {
  const lines = content.split("\n");
  const indexes = lines.map((line, idx) => ({ line, idx })).filter(({ line }) => line.trim().length > 0).map(({ idx }) => idx);
  if (indexes.length === 0) return "";
  const start = indexes[Math.max(0, indexes.length - count)];
  return sliceFromLineIndex(content, lines, start);
}
function afterLastPromptMarker(content) {
  const lines = content.split("\n");
  const idx = lines.findLastIndex((line) => line === "\u203A" || line.startsWith("\u203A "));
  if (idx === -1) return content;
  return sliceFromLineIndex(content, lines, idx + 1);
}
function isHorizontalRule(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  const chars = [...trimmed];
  let ruleChars = 0;
  for (const ch of chars) {
    if (ch === "\u2500") ruleChars += 1;
    else break;
  }
  if (ruleChars === 0) return false;
  const suffix = trimmed.slice(ruleChars).trimStart();
  return suffix.length === 0 || ruleChars >= 3;
}
function afterLastHorizontalRule(content) {
  const lines = content.split("\n");
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
  const lines = content.split("\n");
  const top = promptBoxTopBorderIndex(lines);
  if (top === -1) return null;
  const startOffset = lines.slice(0, top + 1).reduce((sum, line) => sum + line.length + 1, 0);
  const remaining = lines.slice(top + 1);
  const endRelative = remaining.findIndex((line) => isHorizontalRule(line));
  const endIndex = endRelative === -1 ? lines.length : top + 1 + endRelative;
  const endOffset = lines.slice(0, endIndex).reduce((sum, line) => sum + line.length + 1, 0);
  return content.slice(Math.min(startOffset, content.length), Math.min(endOffset, content.length));
}
function codexPromptLine(line) {
  return line === "\u203A" || line.startsWith("\u203A ");
}
function codexBlockMarkerLine(line) {
  return line.startsWith("\u2022") || line.startsWith("\u25A0") || line.startsWith("\u2717") || line.startsWith("\u2713");
}
function currentCodexPromptIndex(lines) {
  const promptIndex = lines.findLastIndex((line) => codexPromptLine(line));
  if (promptIndex === -1) return -1;
  if (lines.slice(promptIndex + 1).some((line) => codexBlockMarkerLine(line))) {
    return -1;
  }
  return promptIndex;
}
function beforeCurrentPromptMarker(content) {
  const lines = content.split("\n");
  const index = currentCodexPromptIndex(lines);
  if (index === -1) return content;
  const byteOffset = lines.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0);
  return content.slice(0, Math.min(byteOffset, content.length));
}
function wholeRecentWithoutCurrentPromptMarker(content) {
  const lines = content.split("\n");
  return currentCodexPromptIndex(lines) === -1 ? content : "";
}
function currentPromptBlockMarker(content) {
  const lines = content.split("\n");
  const promptIndex = currentCodexPromptIndex(lines);
  if (promptIndex === -1) return null;
  for (let i = promptIndex - 1; i >= 0; i--) {
    if (codexBlockMarkerLine(lines[i])) return lines[i];
  }
  return null;
}
function afterCurrentPromptBlockMarker(content) {
  const lines = content.split("\n");
  const promptIndex = currentCodexPromptIndex(lines);
  if (promptIndex === -1) return null;
  let blockIndex = -1;
  for (let i = promptIndex - 1; i >= 0; i--) {
    if (codexBlockMarkerLine(lines[i])) {
      blockIndex = i;
      break;
    }
  }
  if (blockIndex === -1) return null;
  return sliceFromLineIndex(content, lines, blockIndex);
}
function abovePromptBox(content) {
  const lines = content.split("\n");
  const top = promptBoxTopBorderIndex(lines);
  if (top === -1) return content;
  const byteOffset = lines.slice(0, top).reduce((sum, line) => sum + line.length + 1, 0);
  return content.slice(0, Math.min(byteOffset, content.length));
}
function lastNonEmptyLine(content) {
  const lines = content.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) return lines[i];
  }
  return "";
}
function getRegion(input, spec) {
  const trimmed = spec.trim();
  if (trimmed === "osc_title") return input.oscTitle || "";
  if (trimmed === "osc_progress") return input.oscProgress || "";
  const content = input.screen || "";
  switch (trimmed) {
    case "whole_recent":
      return content;
    case "after_last_prompt_marker":
      return afterLastPromptMarker(content);
    case "before_current_prompt_marker":
      return beforeCurrentPromptMarker(content);
    case "whole_recent_without_current_prompt_marker":
      return wholeRecentWithoutCurrentPromptMarker(content);
    case "current_prompt_block_marker": {
      const marker = currentPromptBlockMarker(content);
      return marker === null ? "" : marker;
    }
    case "after_current_prompt_block_marker": {
      const afterMarker = afterCurrentPromptBlockMarker(content);
      return afterMarker === null ? "" : afterMarker;
    }
    case "after_last_horizontal_rule":
      return afterLastHorizontalRule(content);
    case "prompt_box_body": {
      const body = promptBoxBody(content);
      return body === null ? "" : body;
    }
    case "above_prompt_box":
      return abovePromptBox(content);
    case "last_non_empty_above_prompt_box":
      return lastNonEmptyLine(abovePromptBox(content));
    default: {
      const parsed = parseRegionSpec(trimmed);
      if (parsed) {
        if (parsed.name === "bottom_lines") return bottomLines(content, parsed.count);
        if (parsed.name === "bottom_non_empty_lines") {
          return bottomNonEmptyLines(content, parsed.count);
        }
      }
      return content;
    }
  }
}
function compileRegex(pattern) {
  let source = pattern;
  const flags = /* @__PURE__ */ new Set();
  while (source.startsWith("(?")) {
    const close = source.indexOf(")");
    if (close === -1) break;
    const flagGroup = source.slice(2, close);
    for (const ch of flagGroup) {
      if (["i", "m", "s", "u"].includes(ch)) flags.add(ch);
    }
    source = source.slice(close + 1);
  }
  try {
    return new RegExp(source, [...flags].join(""));
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
    const lines = text.split("\n");
    for (const pattern of gate.lineRegex) {
      const re = compileRegex(pattern);
      if (!lines.some((line) => re.test(line))) return false;
    }
  }
  return true;
}
function evaluateGate(gate, text, lowerText) {
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
    not: rule.not
  };
}
function evaluateManifest(manifest, input) {
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
      state: "unknown",
      skipStateUpdate: false,
      visibleIdle: false,
      visibleWorking: false,
      visibleBlocker: false,
      matchedRule: null
    };
  }
  const state = bestRule.state || "unknown";
  return {
    state,
    skipStateUpdate: !!bestRule.skipStateUpdate,
    visibleIdle: !!bestRule.visibleIdle && state === "idle",
    visibleWorking: !!bestRule.visibleWorking && state === "running",
    visibleBlocker: !!bestRule.visibleBlocker && state === "blocked",
    matchedRule: {
      id: bestRule.id,
      priority: bestRule.priority || 0,
      region: bestRule.region || DEFAULT_REGION,
      state
    }
  };
}

// src/lib/terminal/agentStateDetection/manifests/kimi.js
var kimi_default = {
  id: "kimi",
  version: "2026.07.20.1",
  aliases: ["kimi", "kimi-code", "kimi code"],
  rules: [
    {
      id: "current_approval_panel",
      state: "blocked",
      priority: 400,
      region: "whole_recent",
      visibleBlocker: true,
      contains: ["\u21B5 confirm"],
      any: [
        {
          contains: ["run this command?"]
        },
        {
          contains: ["write this file?"]
        },
        {
          contains: ["apply these edits?"]
        },
        {
          contains: ["stop this task?"]
        },
        {
          contains: ["ready to build with this plan?"]
        },
        {
          contains: ["execute command?"]
        },
        {
          contains: ["allow this action?"]
        },
        {
          lineRegex: ["(?i)^\\s*\u25B6?\\s*approve .*\\?$"]
        }
      ],
      all: [
        {
          contains: [" choose"]
        },
        {
          any: [
            {
              contains: ["approve"]
            },
            {
              contains: ["reject"]
            },
            {
              contains: ["revise"]
            }
          ]
        }
      ]
    },
    {
      id: "question_panel",
      state: "blocked",
      priority: 390,
      region: "whole_recent",
      visibleBlocker: true,
      contains: ["\u2191\u2193 select", "esc cancel"],
      lineRegex: ["^\\s*question\\s*$", "^\\s*\\? "],
      any: [
        {
          contains: ["\u21B5 choose"]
        },
        {
          contains: ["\u21B5 toggle"]
        },
        {
          contains: ["\u21B5 save"]
        }
      ]
    },
    {
      id: "legacy_approval_panel",
      state: "blocked",
      priority: 300,
      region: "whole_recent",
      contains: ["requesting approval", "reject"],
      any: [
        {
          contains: ["approve once"]
        },
        {
          contains: ["approve for this session"]
        }
      ],
      all: [
        {
          any: [
            {
              contains: ["1/2/3/4 choose"]
            },
            {
              contains: ["\u21B5 confirm"]
            }
          ]
        }
      ]
    },
    {
      // Explicit idle prompt in bottom 3 lines wins over scrollback, and clears instantly when user inputs text
      id: "kimi_idle_prompt",
      state: "idle",
      priority: 200,
      region: "bottom_lines(3)",
      visibleIdle: true,
      any: [{ contains: ["ctrl+p commands"] }, { lineRegex: ["(?i)^\\s*kimi>"] }]
    },
    {
      id: "background_agent_status_working",
      state: "running",
      priority: 120,
      region: "bottom_lines(8)",
      visibleWorking: true,
      lineRegex: ["(?i)\\bkimi[-\\w.]*\\s+thinking\\b.*\\[[1-9][0-9]*\\s+agents?\\s+running\\]"]
    },
    {
      id: "working_footer_esc_interrupt",
      state: "running",
      priority: 110,
      region: "bottom_lines(8)",
      visibleWorking: true,
      contains: ["esc interrupt"]
    },
    {
      id: "thinking_progress_working",
      state: "running",
      priority: 105,
      region: "bottom_lines(8)",
      visibleWorking: true,
      lineRegex: ["(?i)\\b(thinking|working|processing)\\b.*\\/\\s*[\\d.]+%\\s*\\("]
    },
    {
      id: "moon_spinner_working",
      state: "running",
      priority: 100,
      region: "bottom_lines(8)",
      visibleWorking: true,
      lineRegex: ["^\\s*(\u{1F315}|\u{1F316}|\u{1F317}|\u{1F318}|\u{1F311}|\u{1F312}|\u{1F313}|\u{1F314})\\s*$"]
    },
    {
      id: "braille_spinner_working",
      state: "running",
      priority: 90,
      region: "bottom_lines(8)",
      visibleWorking: true,
      lineRegex: [
        "(?i)^\\s*[\\u2800-\\u28FF]+\\s*(thinking|working|using|analyzing|executing|reading|writing|searching)"
      ]
    }
  ]
};

// src/lib/terminal/stripAnsi.js
function stripAnsi(text) {
  if (typeof text !== "string") return "";
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /\x1b\[[0-9;?]*[a-zA-Z]|\x1bP[\s\S]*?(?:\x1b\\|\x07)|\x1b_[\s\S]*?(?:\x1b\\|\x07)|\x1b\^[\s\S]*?(?:\x1b\\|\x07)|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\r/g,
    ""
  );
}

// src/lib/terminal/agentStateDetection/manifests/claude.js
var claude_default = {
  id: "claude",
  version: "2026.06.10.3",
  aliases: ["claude", "claude-code"],
  rules: [
    {
      id: "osc_title_working",
      state: "running",
      priority: 1100,
      region: "osc_title",
      visibleWorking: true,
      regex: ["^[\\u2800-\\u28FF] "]
    },
    {
      id: "transcript_viewer",
      state: "unknown",
      priority: 1e3,
      region: "bottom_non_empty_lines(3)",
      skipStateUpdate: true,
      contains: ["showing detailed transcript"],
      any: [
        {
          contains: ["ctrl+o", "to toggle"]
        },
        {
          contains: ["ctrl+e", "show all"]
        },
        {
          contains: ["ctrl+e", "collapse"]
        },
        {
          contains: ["\u2191\u2193 scroll"]
        },
        {
          contains: ["? for shortcuts"]
        }
      ]
    },
    {
      id: "live_blocked_form",
      state: "blocked",
      priority: 980,
      region: "after_last_horizontal_rule",
      visibleBlocker: true,
      contains: ["enter to select", "esc to cancel"],
      any: [
        {
          contains: ["tab/arrow keys to navigate"]
        },
        {
          contains: ["arrow keys to navigate"]
        },
        {
          contains: ["arrows to navigate"]
        },
        {
          contains: ["\u2191/\u2193 to navigate"]
        },
        {
          contains: ["\u2191\u2193 to navigate"]
        }
      ]
    },
    {
      id: "dynamic_workflow_prompt",
      state: "blocked",
      priority: 980,
      region: "whole_recent",
      visibleBlocker: true,
      contains: ["run a dynamic workflow?", "esc to cancel"]
    },
    {
      id: "live_prompt_box",
      state: "idle",
      priority: 950,
      region: "prompt_box_body",
      visibleIdle: true,
      lineRegex: ["^\\s*\u276F"],
      not: [
        {
          contains: ["enter to select"]
        },
        {
          contains: ["esc to cancel"]
        },
        {
          contains: ["tab/arrow keys"]
        },
        {
          contains: ["arrow keys to navigate"]
        },
        {
          contains: ["\u2191/\u2193 to navigate"]
        }
      ]
    },
    {
      id: "model_picker_menu",
      state: "unknown",
      priority: 900,
      region: "whole_recent",
      skipStateUpdate: true,
      contains: ["select model", "enter to set as default", "esc to cancel"],
      not: [
        {
          contains: ["do you want to proceed?"]
        },
        {
          contains: ["enter to select"]
        }
      ]
    },
    {
      id: "bash_permission_prompt",
      state: "blocked",
      priority: 850,
      region: "whole_recent",
      visibleBlocker: true,
      contains: ["do you want to proceed?"],
      any: [
        {
          contains: ["bash command"]
        },
        {
          contains: ["bash("]
        },
        {
          contains: ["contains expansion"]
        },
        {
          contains: ["tab to amend"]
        },
        {
          contains: ["ctrl+e to explain"]
        }
      ],
      all: [
        {
          any: [
            {
              lineRegex: ["(?i)^\\s*\u276F?\\s*yes\\b"]
            },
            {
              lineRegex: ["(?i)^\\s*1\\.\\s*yes\\b"]
            },
            {
              lineRegex: ["(?i)^\\s*2\\.\\s*no\\b"]
            }
          ]
        }
      ]
    },
    {
      id: "generic_permission_prompt",
      state: "blocked",
      priority: 840,
      region: "after_last_horizontal_rule",
      visibleBlocker: true,
      contains: ["do you want to proceed?", "esc to cancel"],
      all: [
        {
          any: [
            {
              lineRegex: ["(?i)^\\s*\u276F?\\s*1\\.\\s*yes\\b"]
            },
            {
              lineRegex: ["(?i)^\\s*2\\.\\s*yes\\b"]
            },
            {
              lineRegex: ["(?i)^\\s*2\\.\\s*no\\b"]
            },
            {
              lineRegex: ["(?i)^\\s*3\\.\\s*no\\b"]
            }
          ]
        }
      ]
    },
    {
      id: "legacy_no_prompt_blocker",
      state: "blocked",
      priority: 300,
      region: "whole_recent",
      any: [
        {
          contains: ["do you want to"],
          any: [
            {
              contains: ["yes"]
            },
            {
              contains: ["\u276F"]
            }
          ]
        },
        {
          contains: ["would you like to"],
          any: [
            {
              contains: ["yes"]
            },
            {
              contains: ["\u276F"]
            }
          ]
        },
        {
          contains: ["waiting for permission"]
        },
        {
          contains: ["do you want to allow this connection?"]
        },
        {
          contains: ["tab to amend"]
        },
        {
          contains: ["ctrl+e to explain"]
        },
        {
          contains: ["do you want to proceed?", "esc to cancel"]
        },
        {
          contains: ["review your answers"]
        },
        {
          contains: ["skip interview and plan immediately"]
        }
      ],
      not: [
        {
          regex: ["(?m)^\\s*\u276F\\s*$"]
        }
      ]
    },
    {
      id: "osc_progress_idle",
      state: "idle",
      priority: 250,
      region: "osc_progress",
      regex: ["^4;0"]
    },
    {
      id: "osc_title_idle",
      state: "idle",
      priority: 250,
      region: "osc_title",
      visibleIdle: true,
      regex: ["^\\u2733 "]
    }
  ]
};

// src/lib/terminal/agentStateDetection/manifests/codex.js
var codex_default = {
  id: "codex",
  version: "2026.06.10.3",
  aliases: ["codex"],
  rules: [
    {
      id: "osc_title_blocked",
      state: "blocked",
      priority: 1100,
      region: "osc_title",
      visibleBlocker: true,
      contains: ["Action Required"]
    },
    {
      id: "osc_title_working",
      state: "running",
      priority: 1050,
      region: "osc_title",
      visibleWorking: true,
      regex: ["^[\\u2800-\\u28FF] "]
    },
    {
      id: "transcript_viewer",
      state: "unknown",
      priority: 1e3,
      region: "after_last_prompt_marker",
      skipStateUpdate: true,
      contains: ["\u2191/\u2193 to scroll", "pgup/pgdn to", "home/end to jump", "q to quit"],
      any: [
        {
          contains: ["esc to edit prev"]
        },
        {
          contains: ["esc/\u2190 to edit prev"]
        }
      ]
    },
    {
      id: "live_strong_blocker",
      state: "blocked",
      priority: 900,
      region: "after_last_prompt_marker",
      visibleBlocker: true,
      any: [
        {
          contains: ["press enter to confirm or esc to cancel"]
        },
        {
          contains: ["enter to submit answer"]
        },
        {
          contains: ["enter to submit all"]
        },
        {
          contains: ["allow command?"]
        }
      ]
    },
    {
      id: "weak_blocker",
      state: "blocked",
      priority: 600,
      region: "whole_recent",
      any: [
        {
          contains: ["[y/n]"]
        },
        {
          contains: ["yes (y)"]
        },
        {
          contains: ["do you want to"],
          any: [
            {
              contains: ["yes"]
            },
            {
              contains: ["\u276F"]
            }
          ]
        },
        {
          contains: ["would you like to"],
          any: [
            {
              contains: ["yes"]
            },
            {
              contains: ["\u276F"]
            }
          ]
        }
      ]
    },
    {
      id: "osc_title_idle",
      state: "idle",
      priority: 100,
      region: "osc_title",
      visibleIdle: true,
      regex: ["\\S"],
      not: [
        {
          regex: ["^[\\u2800-\\u28FF]"]
        },
        {
          contains: ["Action Required"]
        }
      ]
    }
  ]
};

// src/lib/terminal/agentStateDetection/manifests/opencode.js
var opencode_default = {
  id: "opencode",
  version: "2026.06.10.1",
  aliases: ["opencode", "open-code"],
  rules: [
    {
      id: "permission_required",
      state: "blocked",
      priority: 300,
      region: "whole_recent",
      visibleBlocker: true,
      any: [
        {
          contains: ["\u25B3 Permission required"]
        },
        {
          contains: ["esc dismiss"],
          any: [
            {
              contains: ["enter confirm"]
            },
            {
              contains: ["enter submit"]
            },
            {
              contains: ["enter toggle"]
            }
          ],
          all: [
            {
              any: [
                {
                  contains: ["\u2191\u2193 select"]
                },
                {
                  contains: ["\u21C6 tab"]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      id: "interrupt_hint_working",
      state: "running",
      priority: 110,
      region: "whole_recent",
      visibleWorking: true,
      any: [
        {
          contains: ["esc to interrupt"]
        },
        {
          contains: ["ctrl+c to interrupt"]
        },
        {
          contains: ["press esc to interrupt"]
        },
        {
          lineRegex: ["(?i).*opencode.*esc (again to )?interrupt"]
        }
      ]
    },
    {
      id: "progress_bar_working",
      state: "running",
      priority: 100,
      region: "whole_recent",
      visibleWorking: true,
      regex: ["(\u25A0|\u2B1D){4,}"]
    }
  ]
};

// src/lib/terminal/agentStateDetection/manifests/grok.js
var grok_default = {
  id: "grok",
  version: "2026.07.03.1",
  aliases: ["grok", "groc", "grok-build"],
  rules: [
    {
      id: "option_dialog_blocked",
      state: "blocked",
      priority: 320,
      region: "whole_recent",
      visibleBlocker: true,
      lineRegex: ["^\\s*\u2503\\s+[0-9a-z]+\\s+\\([\u25CF\u25CB]\\)\\s"]
    },
    {
      id: "permission_hints_blocked",
      state: "blocked",
      priority: 310,
      region: "bottom_non_empty_lines(2)",
      visibleBlocker: true,
      contains: [":select", "ctrl+o:yolo", "ctrl+c:cancel"]
    },
    {
      id: "question_dialog_hints_blocked",
      state: "blocked",
      priority: 305,
      region: "bottom_non_empty_lines(2)",
      visibleBlocker: true,
      contains: ["tab:scrollback", "shift+x:dismiss"]
    },
    {
      id: "permission_scope_selector",
      state: "blocked",
      priority: 300,
      region: "whole_recent",
      visibleBlocker: true,
      contains: ["yes, proceed", "no, reject"],
      any: [
        { contains: ["use \u2190 \u2192 to choose permission whitelist scope"] },
        { contains: ["\u2190/\u2192:scope"] }
      ]
    },
    {
      id: "spinner_status_working",
      state: "running",
      priority: 200,
      region: "whole_recent",
      visibleWorking: true,
      lineRegex: ["^\\s*[\\u2801-\\u28FF]\\s.*\\[stop\\]\\s*$"]
    },
    {
      id: "esc_cancel_hints_working",
      state: "running",
      priority: 190,
      region: "bottom_non_empty_lines(2)",
      visibleWorking: true,
      contains: ["esc:cancel", "ctrl+.:shortcuts"]
    },
    {
      id: "waiting_tool_working",
      state: "running",
      priority: 120,
      region: "whole_recent",
      visibleWorking: true,
      any: [
        {
          all: [{ contains: ["ctrl+c:cancel", "ctrl+enter:interject"] }, { contains: ["waiting"] }]
        },
        {
          lineRegex: ["^\\s*[\\u2801-\\u28FF]\\s+(Run|Read|Search|List)\\b"]
        }
      ]
    },
    {
      id: "prompt_hints_idle",
      state: "idle",
      priority: 100,
      region: "bottom_non_empty_lines(2)",
      visibleIdle: true,
      contains: ["ctrl+.:shortcuts"],
      not: [{ contains: ["esc:cancel"] }, { contains: ["ctrl+c:cancel"] }]
    }
  ]
};

// src/lib/terminal/agentStateDetection/manifests/antigravity.js
var antigravity_default = {
  id: "agy",
  version: "2026.07.23.1",
  aliases: ["agy", "antigravity", "antigravity-cli"],
  rules: [
    {
      id: "permission_prompt",
      state: "blocked",
      priority: 300,
      region: "bottom_lines(8)",
      visibleBlocker: true,
      any: [
        {
          contains: ["requesting permission for:"]
        },
        {
          contains: ["do you want to proceed?"]
        },
        {
          contains: ["tab amend", "edit command"]
        },
        {
          contains: ["allow execution"]
        },
        {
          contains: ["do you grant permission"]
        },
        {
          contains: ["permission requested"]
        },
        {
          contains: ["press enter to confirm"]
        },
        {
          lineRegex: ["(?i)^\\s*\\[y\\/n\\]\\s*$"]
        },
        {
          lineRegex: ["(?i)allow\\s*\\[y\\/n\\]"]
        }
      ]
    },
    {
      // Explicit idle prompt in bottom 3 lines wins over scrollback, and clears instantly when user inputs text
      id: "idle_prompt_footer",
      state: "idle",
      priority: 200,
      region: "bottom_lines(3)",
      visibleIdle: true,
      any: [
        { contains: ["? for shortcuts"] },
        { contains: ["press ? for shortcuts"] },
        { lineRegex: ["(?i)^\\s*(antigravity|>|antigravity\\s*\\(v[^)]+\\))\\s*$"] },
        { lineRegex: ["(?i)^\\s*antigravity>"] },
        { lineRegex: ["(?i)^\\s*>\\s*$"] }
      ]
    },
    {
      // herdr parity: agy 1.1.x / 1.2.x shows "esc to cancel" or "esc to interrupt" in footer while working
      id: "working_footer_esc_cancel",
      state: "running",
      priority: 210,
      region: "bottom_lines(8)",
      visibleWorking: true,
      any: [
        { contains: ["esc to cancel"] },
        { contains: ["esc to interrupt"] },
        { contains: ["ctrl+c to cancel"] },
        { contains: ["ctrl+c to interrupt"] },
        { lineRegex: ["(?i)esc\\s+to\\s+(cancel|interrupt)"] }
      ]
    },
    {
      id: "spinner_working",
      state: "running",
      priority: 100,
      region: "bottom_lines(8)",
      visibleWorking: true,
      any: [
        {
          // Locale-robust (W9): braille spinner frame(s) + any Unicode word.
          // Matches English ("Thinking") and localized TUIs ("Leyendo",
          // "Analizando") alike; the braille frame at line start is the signal.
          lineRegex: ["(?iu)^\\s*[\\u2800-\\u28FF]+\\s+\\p{L}[\\p{L}\\p{M}\\p{N}_]*"]
        },
        {
          lineRegex: [
            "(?i)^\\s*[\\u2800-\\u28FF]+\\s*(thinking|analyzing|executing|reading|writing|searching|working|processing|running|building|testing)"
          ]
        },
        {
          lineRegex: [
            "(?i)^\\s*\xB7\\s*(thinking|analyzing|executing|reading|writing|searching|working|processing|running|building|testing)"
          ]
        },
        {
          lineRegex: ["(?i)^\\s*tool\\s+call\\b"]
        },
        {
          lineRegex: [
            "(?i)\\b(thinking|analyzing|executing|reading|writing|searching|working|processing)..."
          ]
        }
      ]
    },
    {
      id: "background_tasks_working",
      state: "running",
      priority: 90,
      region: "bottom_lines(8)",
      visibleWorking: true,
      lineRegex: ["(?i)\xB7\\s*[1-9][0-9]*\\s+task"]
    }
  ]
};

// src/lib/terminal/agentStateDetection/manifests/qodercli.js
var qodercli_default = {
  id: "qodercli",
  version: "2026.07.24.1",
  aliases: ["qodercli", "qoder", "qoder-cli"],
  rules: [
    {
      id: "permission_prompt",
      state: "blocked",
      priority: 300,
      region: "bottom_lines(8)",
      visibleBlocker: true,
      any: [
        {
          contains: ["do you want to proceed?"]
        },
        {
          contains: ["waiting for permission"]
        },
        {
          contains: ["permission requested"]
        },
        {
          contains: ["allow once", "allow always"]
        },
        {
          lineRegex: ["(?i)^\\s*\u276F?\\s*1\\.\\s*yes\\b"]
        },
        {
          lineRegex: ["(?i)^\\s*\u276F?\\s*yes\\b"]
        },
        {
          lineRegex: ["(?i)allow\\s*\\[y\\/n\\]"]
        },
        {
          lineRegex: ["(?i)^\\s*\\[y\\/n\\]\\s*$"]
        }
      ]
    },
    {
      // Explicit idle prompt in bottom 3 lines wins over scrollback. Qoder CLI
      // shows the `>` dialog-mode indicator (docs: input modes table) plus a
      // shortcuts hint, mirroring the claude-code idle chrome.
      id: "idle_prompt_footer",
      state: "idle",
      priority: 200,
      region: "bottom_lines(3)",
      visibleIdle: true,
      any: [
        { contains: ["? for shortcuts"] },
        { contains: ["press ? for shortcuts"] },
        { lineRegex: ["(?i)^\\s*(qodercli|qoder)\\s*>"] }
      ]
    },
    {
      // claude-code-style footer shown while the agent is generating.
      id: "working_footer_esc_cancel",
      state: "running",
      priority: 210,
      region: "bottom_lines(8)",
      visibleWorking: true,
      any: [
        { contains: ["esc to cancel"] },
        { contains: ["esc to interrupt"] },
        { contains: ["ctrl+c to cancel"] },
        { contains: ["ctrl+c to interrupt"] },
        { lineRegex: ["(?i)esc\\s+to\\s+(cancel|interrupt)"] }
      ]
    },
    {
      id: "spinner_working",
      state: "running",
      priority: 100,
      region: "bottom_lines(8)",
      visibleWorking: true,
      any: [
        {
          // Locale-robust: braille spinner frame(s) + any Unicode word.
          lineRegex: ["(?iu)^\\s*[\\u2800-\\u28FF]+\\s+\\p{L}[\\p{L}\\p{M}\\p{N}_]*"]
        },
        {
          lineRegex: [
            "(?i)^\\s*[\\u2800-\\u28FF]+\\s*(thinking|analyzing|executing|reading|writing|searching|working|processing|running|building|testing)"
          ]
        },
        {
          // claude-style thinking markers (✻ Thinking…, ⏺ Running…) and the
          // plain middle-dot variant.
          lineRegex: [
            "(?i)^\\s*[\u273B\u2733\u273D\u23FA\xB7]\\s*(thinking|analyzing|executing|reading|writing|searching|working|processing|running|building|testing)"
          ]
        },
        {
          lineRegex: ["(?i)^\\s*tool\\s+call\\b"]
        },
        {
          lineRegex: [
            "(?i)\\b(thinking|analyzing|executing|reading|writing|searching|working|processing)..."
          ]
        }
      ]
    }
  ]
};

// src/lib/terminal/agentStateDetection/detector.js
var MANIFESTS = /* @__PURE__ */ new Map([
  ["kimi", kimi_default],
  ["claude", claude_default],
  ["codex", codex_default],
  ["opencode", opencode_default],
  ["grok", grok_default],
  ["agy", antigravity_default],
  ["qodercli", qodercli_default]
]);
var AGENT_TYPE_ALIASES = {
  opencode: "opencode",
  "open-code": "opencode",
  kimi: "kimi",
  "kimi-code": "kimi",
  "kimi code": "kimi",
  claude: "claude",
  "claude-code": "claude",
  codex: "codex",
  grok: "grok",
  groc: "grok",
  "grok-build": "grok",
  hermes: "hermes",
  agy: "agy",
  antigravity: "agy",
  "antigravity-cli": "agy",
  qodercli: "qodercli",
  qoder: "qodercli",
  "qoder-cli": "qodercli"
};
var manifestCache = /* @__PURE__ */ new Map();
function normalizeAgentType(agentType) {
  if (!agentType) return null;
  const key = String(agentType).trim().toLowerCase();
  return AGENT_TYPE_ALIASES[key] || key;
}
function loadManifest(agentType) {
  const normalized = normalizeAgentType(agentType);
  if (!normalized) return null;
  if (manifestCache.has(normalized)) {
    return manifestCache.get(normalized);
  }
  const manifest = MANIFESTS.get(normalized) || null;
  manifestCache.set(normalized, manifest);
  return manifest;
}
var UNKNOWN_DETECTION = {
  state: "unknown",
  skipStateUpdate: true,
  visibleIdle: false,
  visibleWorking: false,
  visibleBlocker: false,
  matchedRule: null
};
var NO_MATCH_DETECTION = {
  state: "unknown",
  skipStateUpdate: true,
  visibleIdle: false,
  visibleWorking: false,
  visibleBlocker: false,
  matchedRule: null
};
function detectAgentState(agentType, screen, options = {}) {
  const manifest = loadManifest(agentType);
  if (!manifest) {
    return UNKNOWN_DETECTION;
  }
  const cleanScreen = stripAnsi(screen || "");
  const isCancellation = /(?:\^C|\binterrupted\b|\bcancelled\b|\bcanceled\b|\baborted\b)/i.test(
    cleanScreen
  );
  const detected = evaluateManifest(manifest, {
    screen: cleanScreen,
    oscTitle: options.oscTitle || "",
    oscProgress: options.oscProgress || ""
  });
  if (isCancellation) {
    detected.wasCancelled = true;
  }
  if (detected.state === "unknown") {
    if (detected.matchedRule) {
      return detected;
    }
    return { ...NO_MATCH_DETECTION, wasCancelled: detected.wasCancelled };
  }
  return detected;
}

// src/lib/terminal/agentStateDetection/stateMachine.js
var PENDING_IDLE_CAP_MS = 4e3;
var PENDING_IDLE_CONFIRMATIONS = 6;
var STABLE_VISIBLE_SIGNAL_REFRESH_MS = 800;
var TRANSITION_DWELL_MS = 1500;
var AgentStateMachine = class {
  constructor() {
    this.state = "unknown";
    this.lastVisibleIdle = false;
    this.lastVisibleBlocker = false;
    this.lastVisibleWorking = false;
    this.lastVisibleSignalRefresh = null;
    this.pendingIdle = null;
    this.pendingTransition = null;
  }
  /**
   * Avoid flickering from running → idle on transient pauses.
   * Holds the transition until confirmed several times or a cap expires.
   */
  shouldHoldWorkingToIdle(previous, next, now) {
    const isWorkingToPlainIdle = previous.state === "running" && next.state === "idle" && !next.visibleIdle && !next.visibleBlocker;
    if (!isWorkingToPlainIdle) {
      this.pendingIdle = null;
      return false;
    }
    if (!this.pendingIdle) {
      this.pendingIdle = { startedAt: now, confirmations: 0 };
      return true;
    }
    if (now - this.pendingIdle.startedAt >= PENDING_IDLE_CAP_MS) {
      this.pendingIdle = null;
      return false;
    }
    this.pendingIdle.confirmations += 1;
    if (this.pendingIdle.confirmations >= PENDING_IDLE_CONFIRMATIONS) {
      this.pendingIdle = null;
      return false;
    }
    return true;
  }
  /**
   * Generic anti-flap dwell for any non-authoritative state change not already
   * covered by shouldHoldWorkingToIdle (e.g. running→idle with the prompt
   * visible, idle→running, running→blocked). The candidate state must persist
   * for TRANSITION_DWELL_MS before it publishes; any detection of a different
   * state abandons the candidate. First publish from 'unknown' is immediate.
   */
  shouldHoldTransition(previous, next, now) {
    if (next.state === previous.state) {
      this.pendingTransition = null;
      return false;
    }
    if (previous.state === "unknown") {
      this.pendingTransition = null;
      return false;
    }
    if (previous.state === "running" && next.state === "idle" && !next.visibleIdle && !next.visibleBlocker) {
      this.pendingTransition = null;
      return false;
    }
    if (this.pendingTransition && this.pendingTransition.state === next.state) {
      if (now - this.pendingTransition.startedAt >= TRANSITION_DWELL_MS) {
        this.pendingTransition = null;
        return false;
      }
      return true;
    }
    this.pendingTransition = { state: next.state, startedAt: now };
    return true;
  }
  /**
   * Periodically refresh a stable visible blocker so consumers keep noticing it.
   */
  stableVisibleSignalRefreshDue(next, now) {
    const stableVisibleSignal = next.visibleBlocker && this.lastVisibleBlocker || next.visibleWorking && this.lastVisibleWorking;
    if (!stableVisibleSignal) return false;
    if (this.lastVisibleSignalRefresh === null) return true;
    return now - this.lastVisibleSignalRefresh >= STABLE_VISIBLE_SIGNAL_REFRESH_MS;
  }
  /**
   * Directly publish a hook state report, bypassing anti-flicker hold.
   */
  publishHook(detection, now = Date.now()) {
    this.pendingIdle = null;
    this.pendingTransition = null;
    return this.publish(detection, now, { bypassHold: true });
  }
  /**
   * Consume a detection result and optionally return a published state change.
   *
   * @param {object} detection
   * @param {string} detection.state — 'idle' | 'running' | 'blocked' | 'unknown'
   * @param {boolean} detection.visibleIdle
   * @param {boolean} detection.visibleWorking
   * @param {boolean} detection.visibleBlocker
   * @param {number} now — timestamp in ms
   * @param {object} [options]
   * @param {boolean} [options.bypassHold] — skip anti-flicker hold (used for authoritative hooks)
   * @returns {object|null} published state or null if unchanged
   */
  publish(detection, now = Date.now(), options = {}) {
    if (detection.state === "unknown" && !options.bypassHold) {
      return null;
    }
    if (options.bypassHold) {
      this.pendingTransition = null;
    }
    const next = {
      state: detection.state,
      visibleIdle: detection.visibleIdle,
      visibleWorking: detection.visibleWorking,
      visibleBlocker: detection.visibleBlocker,
      // Evidence tag (DONE-EVIDENCE-01): 'manifest' | 'prompt-visible' |
      // 'user-input' | 'quiescence' | 'hook:<event>' | ... Propagated so
      // consumers can tell evidence-based transitions from silence-based ones.
      reason: detection.reason ?? null
    };
    const previous = {
      state: this.state,
      visibleIdle: this.lastVisibleIdle,
      visibleWorking: this.lastVisibleWorking,
      visibleBlocker: this.lastVisibleBlocker
    };
    if (!options.bypassHold && this.shouldHoldWorkingToIdle(previous, next, now)) {
      return null;
    }
    if (!options.bypassHold && this.shouldHoldTransition(previous, next, now)) {
      return null;
    }
    const stableRefreshDue = this.stableVisibleSignalRefreshDue(next, now);
    const unchanged = previous.state === next.state && previous.visibleIdle === next.visibleIdle && previous.visibleWorking === next.visibleWorking && previous.visibleBlocker === next.visibleBlocker;
    if (unchanged && !stableRefreshDue) {
      return null;
    }
    this.state = next.state;
    this.lastVisibleIdle = next.visibleIdle;
    this.lastVisibleWorking = next.visibleWorking;
    this.lastVisibleBlocker = next.visibleBlocker;
    this.lastVisibleSignalRefresh = next.visibleBlocker || next.visibleWorking ? now : null;
    return next;
  }
};

// src/lib/terminal/agentTuiMetadata.shared.js
var AGENT_TUI_TYPES = [
  "opencode",
  "kimi",
  "claude",
  "codex",
  "grok",
  "hermes",
  "agy",
  "qodercli"
];
var AGENT_TUI_PATTERN = new RegExp(
  `\\b(?:${AGENT_TUI_TYPES.map((t) => t === "grok" ? "grok|groc" : t).join("|")})\\b`,
  "i"
);

// src/lib/terminal/extractBottomViewport.js
function processCarriageReturns(text) {
  if (!text || typeof text !== "string" || !text.includes("\r")) return text;
  const normalized = text.replace(/\r\n/g, "\n");
  return normalized.split("\n").map((line) => {
    if (!line.includes("\r")) return line;
    const parts = line.split("\r");
    return parts[parts.length - 1];
  }).join("\n");
}
function extractBottomViewport(buffer, options = {}) {
  const maxLines = Math.max(1, Number(options.maxLines) || DEFAULT_DETECTION_VIEWPORT_LINES);
  if (!buffer || typeof buffer !== "string") return "";
  const sanitized = processCarriageReturns(buffer);
  const lines = sanitized.split("\n");
  if (lines.length <= maxLines) return sanitized;
  return lines.slice(-maxLines).join("\n");
}
var DEFAULT_DETECTION_VIEWPORT_LINES = 40;
var DEFAULT_DETECTION_BUFFER_CHARS = 8192;
var MAX_DETECTION_VIEWPORT_LINES = 240;
var MAX_DETECTION_BUFFER_CHARS = 262144;
function resolveDetectionSizing(options = {}) {
  const rows = Math.max(0, Math.floor(Number(options.rows) || 0));
  const cols = Math.max(0, Math.floor(Number(options.cols) || 0));
  let viewportLines = Math.floor(Number(options.viewportLines) || 0);
  if (!(viewportLines > 0)) {
    viewportLines = Math.max(DEFAULT_DETECTION_VIEWPORT_LINES, rows);
  }
  viewportLines = Math.min(Math.max(1, viewportLines), MAX_DETECTION_VIEWPORT_LINES);
  let bufferChars = Math.floor(Number(options.bufferChars) || 0);
  if (!(bufferChars > 0)) {
    bufferChars = Math.max(DEFAULT_DETECTION_BUFFER_CHARS, rows * cols * 2);
  }
  bufferChars = Math.min(
    Math.max(DEFAULT_DETECTION_BUFFER_CHARS, bufferChars),
    MAX_DETECTION_BUFFER_CHARS
  );
  return { viewportLines, bufferChars };
}

// src/lib/terminal/agentStateTrace.js
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var MAX_TRACE_BYTES = 5 * 1024 * 1024;
var cachedDir = null;
function resolveTraceDir() {
  if (cachedDir) return cachedDir;
  cachedDir = process.env.DEVHUB_AGENT_TRACE_DIR || import_path.default.join(process.cwd(), "data", "logs", "agent-state");
  return cachedDir;
}
function isAgentStateTraceEnabled() {
  return process.env.DEVHUB_AGENT_TRACE !== "off";
}
function traceAgentStateTransition(entry) {
  if (!isAgentStateTraceEnabled()) return;
  try {
    const dir = resolveTraceDir();
    import_fs.default.mkdirSync(dir, { recursive: true });
    const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const file = import_path.default.join(dir, `${day}.jsonl`);
    try {
      const stat = import_fs.default.statSync(file);
      if (stat.size > MAX_TRACE_BYTES) {
        import_fs.default.renameSync(file, `${file}.1`);
      }
    } catch {
    }
    import_fs.default.appendFileSync(file, `${JSON.stringify({ at: Date.now(), ...entry })}
`);
  } catch {
  }
}
function tracePublishedTransition(session, published, extra = {}) {
  if (!published) return;
  const now = extra.now ?? Date.now();
  const prevState = extra.prev ?? session?.agentTuiState ?? null;
  const prevReason = session?.agentTuiStateReason ?? null;
  if (!extra.upgrade && published.state === prevState && (published.reason ?? null) === prevReason) {
    return;
  }
  const hookAt = Number(session?.hookState?.at) || null;
  const lastActivityAt = Number(session?.lastActivityAt) || null;
  traceAgentStateTransition({
    terminalId: session?.id ?? null,
    agentType: session?.agentType ?? null,
    prev: prevState,
    next: published.state,
    reason: published.reason ?? null,
    hookEvent: session?.hookState?.event ?? null,
    hookAgeMs: hookAt ? now - hookAt : null,
    lastActivityAgeMs: lastActivityAt ? now - lastActivityAt : null,
    source: extra.source ?? null,
    upgrade: Boolean(extra.upgrade)
  });
}

// src/lib/terminal/sessionAgentDetector.js
var HOOK_AUTHORITY_TTL_MS = Number(process.env.DEVHUB_HOOK_AUTHORITY_TTL_MS || 12e4);
var HOOK_AUTHORITY_AGENTS = [
  "kimi",
  "claude",
  "opencode",
  "agy",
  "antigravity",
  "qodercli"
];
var AGENT_STARTUP_GRACE_MS = Number(process.env.DEVHUB_AGENT_STARTUP_GRACE_MS || 3500);
var DEFAULT_AGENT_QUIESCENCE_MS = Number(process.env.DEVHUB_AGENT_QUIESCENCE_MS || 4e3);
var DEFAULT_AGENT_QUIESCENCE_CONFIRM_MS = Number(
  process.env.DEVHUB_AGENT_QUIESCENCE_CONFIRM_MS || 12e3
);
var HOOK_TOOL_ACTIVE_VETO_CAP_MS = Number(
  process.env.DEVHUB_HOOK_TOOL_ACTIVE_VETO_CAP_MS || 30 * 60 * 1e3
);
function getQuiescenceMs(session) {
  const override = Number(session?.detectionQuiescenceMs);
  return override > 0 ? override : DEFAULT_AGENT_QUIESCENCE_MS;
}
function getQuiescenceConfirmMs(session) {
  const override = Number(session?.detectionQuiescenceConfirmMs);
  return override > 0 ? override : DEFAULT_AGENT_QUIESCENCE_CONFIRM_MS;
}
function hasActiveHookTool(session, now = Date.now()) {
  if (!session?.hookToolActive) return false;
  const since = Number(session.hookToolActiveAt);
  if (!since) return true;
  return now - since < HOOK_TOOL_ACTIVE_VETO_CAP_MS;
}
function trackPublishedReason(session, published, extra = {}) {
  if (!published) return;
  tracePublishedTransition(session, published, extra);
  session.agentTuiStateReason = published.reason ?? null;
  if (published.state === "idle") {
    session._lastIdleReason = published.reason ?? null;
  }
}
function getLastActivityAt(session) {
  return session.lastActivityAt ?? session.lastWorkingAt ?? null;
}
function getDetectionSizing(session) {
  return resolveDetectionSizing({
    cols: session?.termsize?.cols,
    rows: session?.termsize?.rows,
    viewportLines: session?.detectionViewportLines,
    bufferChars: session?.detectionBufferChars
  });
}
function hasFreshHookAuthority(session, now = Date.now()) {
  if (!session?.hookState || typeof session.hookState.at !== "number") {
    return false;
  }
  const sourceAgent = session.hookState.source ? session.hookState.source.replace(/^devhub:/, "") : null;
  const agentType = session.agentType || sourceAgent;
  if (!agentType || !HOOK_AUTHORITY_AGENTS.includes(agentType)) {
    return false;
  }
  const ttl = hasActiveHookTool(session, now) ? Math.max(HOOK_AUTHORITY_TTL_MS, HOOK_TOOL_ACTIVE_VETO_CAP_MS) : HOOK_AUTHORITY_TTL_MS;
  return now - session.hookState.at < ttl;
}
function ensureAgentDetectionSession(session) {
  if (!session) return session;
  if (!session.agentStateMachine) {
    session.agentStateMachine = new AgentStateMachine();
  }
  if (session.detectionBuffer === void 0) {
    session.detectionBuffer = "";
  }
  if (session.oscProgress === void 0) {
    session.oscProgress = "";
  }
  return session;
}
function ingestAgentDetectionFromFilteredOutput(session, filtered, now = Date.now()) {
  ensureAgentDetectionSession(session);
  const result = {
    published: null,
    agentTuiState: session.agentTuiState ?? null,
    agentTuiStateAt: session.agentTuiStateAt ?? null
  };
  if (!session.agentType || !session.agentStateMachine) {
    return result;
  }
  if (typeof filtered !== "string" || !filtered) {
    return result;
  }
  session.detectionBuffer = (session.detectionBuffer || "") + filtered;
  const sizing = getDetectionSizing(session);
  if (session.detectionBuffer.length > sizing.bufferChars) {
    session.detectionBuffer = session.detectionBuffer.slice(-sizing.bufferChars);
  }
  session.lastActivityAt = now;
  if (hasFreshHookAuthority(session, now)) {
    session._hadHookAuthority = true;
    return result;
  }
  if (session._hadHookAuthority) {
    session._hadHookAuthority = false;
    session.lastDetection = null;
  }
  const collapsedBuffer = processCarriageReturns(session.detectionBuffer || "");
  const cleanBuffer = stripAnsi(collapsedBuffer);
  const screen = extractBottomViewport(cleanBuffer, {
    maxLines: sizing.viewportLines
  });
  const detected = detectAgentState(session.agentType, screen, {
    oscTitle: session.title || "",
    oscProgress: session.oscProgress || ""
  });
  if (detected.visibleWorking) {
    session.lastWorkingAt = now;
  }
  if (detected.skipStateUpdate) {
    return result;
  }
  if (detected.state === "unknown") {
    return result;
  }
  const quiescenceMs = getQuiescenceMs(session);
  const lastActivityAt = getLastActivityAt(session);
  const isQuiescent = lastActivityAt && now - lastActivityAt > quiescenceMs;
  if (session.agentTuiState === "running" && detected.state === "idle" && !detected.visibleIdle && !isQuiescent) {
    return result;
  }
  if (detected.state === "running" && session.agentDetectedAt && !session.lastUserInputAt && now - session.agentDetectedAt < AGENT_STARTUP_GRACE_MS) {
    return result;
  }
  detected.reason = detected.state === "idle" && detected.visibleIdle ? "prompt-visible" : "manifest";
  session.lastDetection = detected;
  const published = session.agentStateMachine.publish(detected, now);
  if (published) {
    trackPublishedReason(session, published, { source: "ingest", now });
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
    result.published = {
      ...published,
      wasCancelled: Boolean(detected.wasCancelled)
    };
    result.agentTuiState = published.state;
    result.agentTuiStateAt = now;
    result.wasCancelled = Boolean(detected.wasCancelled);
  }
  return result;
}
function notifyUserInput(session, now = Date.now()) {
  ensureAgentDetectionSession(session);
  session.lastUserInputAt = now;
  session.lastWorkingAt = now;
  session.lastActivityAt = now;
  const detection = {
    state: "running",
    visibleIdle: false,
    visibleWorking: true,
    visibleBlocker: false,
    reason: "user-input"
  };
  session.lastDetection = detection;
  const published = session.agentStateMachine.publish(detection, now, { bypassHold: true });
  if (published) {
    trackPublishedReason(session, published, { source: "user-input", now });
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
  }
  return published;
}
function tickAgentDetection(session, now = Date.now()) {
  ensureAgentDetectionSession(session);
  const result = {
    published: null,
    agentTuiState: session.agentTuiState ?? null,
    agentTuiStateAt: session.agentTuiStateAt ?? null
  };
  if (!session.agentType || !session.agentStateMachine) {
    return result;
  }
  const pty = session.pty || session.ptyProcess;
  const ptyPid = session.ptyPid || pty && pty.pid;
  if (!pty || !ptyPid) {
    session.hookState = null;
    session.hookToolActive = false;
    const published = session.agentStateMachine.publish(
      {
        state: "idle",
        visibleIdle: true,
        visibleWorking: false,
        visibleBlocker: false,
        reason: "pty-dead"
      },
      now
    );
    if (published) {
      trackPublishedReason(session, published, { source: "tick", now });
      session.agentTuiState = published.state;
      session.agentTuiStateAt = now;
      result.published = published;
      result.agentTuiState = published.state;
      result.agentTuiStateAt = now;
    }
    return result;
  }
  if (hasFreshHookAuthority(session, now)) {
    session._hadHookAuthority = true;
    return result;
  }
  if (session._hadHookAuthority) {
    session._hadHookAuthority = false;
    session.lastDetection = null;
  }
  const bufferUnchanged = session.lastTickBuffer === session.detectionBuffer;
  session.lastTickBuffer = session.detectionBuffer;
  const state = session.agentTuiState;
  const isRunningOrBlocked = state === "running" || state === "blocked";
  const hasPendingIdle = !!session.agentStateMachine.pendingIdle;
  const hasPendingTransition = !!session.agentStateMachine.pendingTransition;
  const quiescenceMs = getQuiescenceMs(session);
  const quiescenceConfirmMs = getQuiescenceConfirmMs(session);
  const lastActivityAt = getLastActivityAt(session);
  const silentForMs = lastActivityAt ? now - lastActivityAt : 0;
  const quiescenceVetoed = hasActiveHookTool(session, now);
  if (!quiescenceVetoed && state === "running" && lastActivityAt && silentForMs > quiescenceMs) {
    const fallbackIdle = {
      state: "idle",
      visibleIdle: false,
      visibleWorking: false,
      visibleBlocker: false,
      reason: silentForMs > quiescenceConfirmMs ? "quiescence-confirmed" : "quiescence"
    };
    session.lastDetection = fallbackIdle;
    const published = session.agentStateMachine.publish(fallbackIdle, now, { bypassHold: true });
    if (published) {
      trackPublishedReason(session, published, { source: "tick", now });
      session.agentTuiState = published.state;
      session.agentTuiStateAt = now;
      result.published = published;
      result.agentTuiState = published.state;
      result.agentTuiStateAt = now;
    }
    return result;
  }
  if (!quiescenceVetoed && state === "idle" && session._lastIdleReason === "quiescence" && lastActivityAt && silentForMs > quiescenceConfirmMs) {
    const upgraded = {
      state: "idle",
      visibleIdle: false,
      visibleWorking: false,
      visibleBlocker: false,
      reason: "quiescence-confirmed"
    };
    session.lastDetection = upgraded;
    trackPublishedReason(session, upgraded, { source: "tick", now, upgrade: true });
    session.agentTuiState = "idle";
    session.agentTuiStateAt = now;
    result.published = upgraded;
    result.agentTuiState = "idle";
    result.agentTuiStateAt = now;
    return result;
  }
  if (bufferUnchanged && !isRunningOrBlocked && !hasPendingIdle && !hasPendingTransition) {
    return result;
  }
  if (session.lastDetection) {
    const published = session.agentStateMachine.publish(session.lastDetection, now);
    if (published) {
      trackPublishedReason(session, published, { source: "tick", now });
      session.agentTuiState = published.state;
      session.agentTuiStateAt = now;
      result.published = published;
      result.agentTuiState = published.state;
      result.agentTuiStateAt = now;
    }
  }
  return result;
}

// src/lib/terminal/oscTitleParser.js
var OSC_TITLE_RE = /\x1b\](0|2);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
var MAX_OSC_TITLE_BUFFER = 1024;
function processOscTitle(session, chunk) {
  if (typeof chunk !== "string" || !chunk) return;
  const buffer = (session._oscTitleBuffer || "") + chunk;
  OSC_TITLE_RE.lastIndex = 0;
  let match;
  let lastIndex = 0;
  while ((match = OSC_TITLE_RE.exec(buffer)) !== null) {
    session.title = match[2] || null;
    lastIndex = OSC_TITLE_RE.lastIndex;
  }
  const remaining = buffer.slice(lastIndex);
  session._oscTitleBuffer = remaining.slice(-MAX_OSC_TITLE_BUFFER);
}
function stripOscTitleSequences(chunk) {
  if (typeof chunk !== "string" || !chunk) return chunk;
  return chunk.replace(OSC_TITLE_RE, "");
}

// src/lib/terminal/oscProgressParser.js
var OSC_PROGRESS_RE = /\x1b\](\d+);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
var MAX_OSC_PROGRESS_BUFFER = 512;
function processOscProgress(session, chunk) {
  if (typeof chunk !== "string" || !chunk) return;
  const buffer = (session._oscProgressBuffer || "") + chunk;
  OSC_PROGRESS_RE.lastIndex = 0;
  let match;
  let lastIndex = 0;
  while ((match = OSC_PROGRESS_RE.exec(buffer)) !== null) {
    const code = match[1];
    const payload = match[2] || "";
    if (code === "9" || code === "4") {
      session.oscProgress = payload;
    }
    lastIndex = OSC_PROGRESS_RE.lastIndex;
  }
  session._oscProgressBuffer = buffer.slice(lastIndex).slice(-MAX_OSC_PROGRESS_BUFFER);
}

// src/lib/terminal/agentHooks/hookEnv.js
var import_crypto = __toESM(require("crypto"));
function generateSessionHookToken() {
  return import_crypto.default.randomBytes(16).toString("hex");
}
function buildSessionHookEnv({ session, hookUrl } = {}) {
  if (!session) return {};
  const url = hookUrl || process.env.DEVHUB_HOOK_URL;
  if (!url) {
    throw new Error(
      "hookUrl is required in buildSessionHookEnv (pass hookUrl or set DEVHUB_HOOK_URL)"
    );
  }
  if (!session.hookToken) {
    session.hookToken = generateSessionHookToken();
  }
  return {
    DEVHUB_HOOK_ENV: "1",
    DEVHUB_TERMINAL_ID: session.id || "",
    DEVHUB_HOOK_URL: url,
    DEVHUB_HOOK_TOKEN: session.hookToken
  };
}

// src/lib/terminal/agentStateFrame.js
function buildAgentStateFrame(session, state, extra = {}) {
  if (!state) return null;
  const frame = {
    type: "agent-state",
    agentTuiState: state,
    at: extra.at ?? session?.agentTuiStateAt ?? Date.now()
  };
  const agentType = extra.agentType ?? session?.agentType ?? null;
  if (agentType) {
    frame.agentType = agentType;
  }
  const wasCancelled = extra.wasCancelled ?? session?._lastAgentStateEvent?.wasCancelled;
  if (wasCancelled !== void 0 && wasCancelled !== null) {
    frame.wasCancelled = Boolean(wasCancelled);
  }
  const reason = extra.reason ?? session?.agentTuiStateReason ?? null;
  if (reason) {
    frame.reason = reason;
  }
  return frame;
}

// src/lib/terminal/agentHooks/handleHookReport.js
var ALLOWED_HOOK_STATES = ["working", "blocked", "idle", "session"];
var ANTIGRAVITY_BRIDGE_SOURCE = "antigravity-hook";
var HOOK_TOOL_START_EVENTS = ["PreToolUse", "SubagentStart"];
var HOOK_TOOL_END_EVENTS = ["PostToolUse", "PostToolUseFailure", "SubagentStop"];
var HOOK_TURN_END_EVENTS = ["Stop", "Interrupt", "StopFailure", "SessionEnd"];
function updateHookToolActive(session, event, now) {
  if (!event) return;
  if (HOOK_TOOL_START_EVENTS.includes(event)) {
    session.hookToolActive = true;
    session.hookToolActiveAt = now;
  } else if (HOOK_TOOL_END_EVENTS.includes(event) || HOOK_TURN_END_EVENTS.includes(event)) {
    session.hookToolActive = false;
    session.hookToolActiveAt = null;
  }
}
function trackHookPublishedReason(session, published, extra = {}) {
  if (!published) return;
  tracePublishedTransition(session, published, extra);
  session.agentTuiStateReason = published.reason ?? null;
  if (published.state === "idle") {
    session._lastIdleReason = published.reason ?? null;
  }
}
function buildReasonUpgradeFrame(session, mappedState, reason, now, source) {
  const isAuthoritativeIdle = mappedState === "idle" && session.agentTuiState === "idle" && (session._lastIdleReason === "quiescence" || session._lastIdleReason === "quiescence-confirmed");
  if (!isAuthoritativeIdle) return null;
  tracePublishedTransition(session, { state: "idle", reason }, { source, upgrade: true, now });
  session.agentTuiStateReason = reason;
  session._lastIdleReason = reason;
  return buildAgentStateFrame(session, "idle", { at: now, reason });
}
function handleHookReport(sessionsMap, body, now = Date.now()) {
  if (!body || typeof body !== "object") {
    return { status: 400, error: "Invalid JSON payload" };
  }
  const { terminalId, token, state, event, source, agent, agentSessionId } = body;
  if (!terminalId || typeof terminalId !== "string" || !token || typeof token !== "string" || !state || typeof state !== "string") {
    return { status: 400, error: "Missing required fields: terminalId, token, state" };
  }
  if (!ALLOWED_HOOK_STATES.includes(state)) {
    return {
      status: 400,
      error: `Invalid state '${state}'. Allowed: ${ALLOWED_HOOK_STATES.join(", ")}`
    };
  }
  const session = typeof sessionsMap.get === "function" ? sessionsMap.get(terminalId) : sessionsMap[terminalId];
  if (!session) {
    return { status: 404, error: `Session '${terminalId}' not found` };
  }
  if (!session.hookToken || session.hookToken !== token) {
    return { status: 403, error: "Invalid session token" };
  }
  if (agentSessionId) {
    session.agentSessionId = agentSessionId;
  }
  if (agent && !session.agentType) {
    session.agentType = agent;
  }
  if (state === "session") {
    return { status: 204, session, broadcast: null };
  }
  const mappedState = state === "working" ? "running" : state;
  updateHookToolActive(session, event || null, now);
  session.hookState = {
    state: mappedState,
    rawState: state,
    event: event || null,
    at: now,
    source: source || `devhub:${agent || session.agentType || "unknown"}`,
    agentSessionId: agentSessionId || session.agentSessionId || null
  };
  const detection = {
    state: mappedState,
    visibleWorking: mappedState === "running",
    visibleBlocker: mappedState === "blocked",
    visibleIdle: mappedState === "idle",
    reason: `hook:${event || state}`
  };
  const published = session.agentStateMachine ? session.agentStateMachine.publishHook(detection, now) : null;
  if (published) {
    trackHookPublishedReason(session, published, { source: "hook", now });
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
  }
  const broadcastPayload = published ? buildAgentStateFrame(session, published.state, { at: now }) : buildReasonUpgradeFrame(session, mappedState, detection.reason, now, "hook");
  return { status: 204, broadcast: broadcastPayload, session };
}
function resolveBridgeTargetSession(sessionsMap, body) {
  const { conversationId, workspacePaths } = body;
  const sessions = typeof sessionsMap.values === "function" ? [...sessionsMap.values()] : Object.values(sessionsMap);
  if (conversationId) {
    const byConversation = sessions.find((s) => s?.agentConversationId === conversationId);
    if (byConversation) return byConversation;
  }
  if (Array.isArray(workspacePaths) && workspacePaths.length > 0) {
    const normalized = workspacePaths.map(
      (p) => String(p).replace(/[\\/]+$/, "").toLowerCase()
    );
    const byWorkspace = sessions.find((s) => {
      const cwd = String(s?.cwd || s?.workspacePath || "").replace(/[\\/]+$/, "").toLowerCase();
      return cwd && normalized.some((wp) => cwd === wp || cwd.startsWith(wp + "/") || wp.startsWith(cwd + "/"));
    });
    if (byWorkspace) {
      if (conversationId) byWorkspace.agentConversationId = conversationId;
      return byWorkspace;
    }
  }
  let best = null;
  let bestAt = -1;
  for (const s of sessions) {
    if (!s || s.agentType !== "agy" && s.agentType !== "antigravity") continue;
    const at = s.lastActivityAt ?? s.agentTuiStateAt ?? 0;
    if (at >= bestAt) {
      best = s;
      bestAt = at;
    }
  }
  if (best && conversationId) best.agentConversationId = conversationId;
  return best;
}
function handleBridgeHookReport(sessionsMap, body, now = Date.now(), options = {}) {
  if (!body || typeof body !== "object") {
    return { status: 400, error: "Invalid JSON payload" };
  }
  const { token, state } = body;
  if (!token || typeof token !== "string" || !state || typeof state !== "string") {
    return { status: 400, error: "Missing required fields: token, state" };
  }
  if (!ALLOWED_HOOK_STATES.includes(state)) {
    return {
      status: 400,
      error: `Invalid state '${state}'. Allowed: ${ALLOWED_HOOK_STATES.join(", ")}`
    };
  }
  if (options.bridgeToken && token !== options.bridgeToken) {
    return { status: 403, error: "Invalid bridge token" };
  }
  const session = resolveBridgeTargetSession(sessionsMap, body);
  if (!session) {
    return { status: 404, error: "No matching session for bridge report" };
  }
  if (!session.agentType) {
    session.agentType = "agy";
  }
  if (body.conversationId && !session.agentConversationId) {
    session.agentConversationId = body.conversationId;
  }
  if (state === "session") {
    return { status: 204, session, broadcast: null };
  }
  const mappedState = state === "working" ? "running" : state;
  updateHookToolActive(session, body.event || null, now);
  session.hookState = {
    state: mappedState,
    rawState: state,
    event: body.event || null,
    at: now,
    source: body.source || ANTIGRAVITY_BRIDGE_SOURCE,
    agentSessionId: body.conversationId || session.agentSessionId || null,
    conversationId: body.conversationId || null,
    terminationReason: body.terminationReason || null,
    transcriptPath: body.transcriptPath || null
  };
  const detection = {
    state: mappedState,
    visibleWorking: mappedState === "running",
    visibleBlocker: mappedState === "blocked",
    visibleIdle: mappedState === "idle",
    reason: `hook:${body.event || state}`
  };
  const published = session.agentStateMachine ? session.agentStateMachine.publishHook(detection, now) : null;
  if (published) {
    trackHookPublishedReason(session, published, { source: "hook-bridge", now });
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
  }
  const broadcastPayload = published ? buildAgentStateFrame(session, published.state, { at: now }) : buildReasonUpgradeFrame(session, mappedState, detection.reason, now, "hook-bridge");
  return { status: 204, broadcast: broadcastPayload, session };
}

// src/lib/terminal/agentHooks/bridgeConfig.js
var import_fs2 = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));
var import_os = __toESM(require("os"));
var HOOK_BRIDGE_CONFIG_PATH_ENV = "DEVHUB_HOOK_BRIDGE_CONFIG";
function resolveHookBridgeConfigPath(homeDir = import_os.default.homedir()) {
  const override = process.env[HOOK_BRIDGE_CONFIG_PATH_ENV];
  if (override) return override;
  return import_path2.default.join(homeDir, ".devhub", "hook-bridge.json");
}
function writeHookBridgeConfig({ url, token } = {}, homeDir) {
  if (!url || typeof url !== "string") {
    throw new Error("writeHookBridgeConfig: url is required");
  }
  if (!token || typeof token !== "string") {
    throw new Error("writeHookBridgeConfig: token is required");
  }
  const configPath = resolveHookBridgeConfigPath(homeDir);
  const dir = import_path2.default.dirname(configPath);
  if (!import_fs2.default.existsSync(dir)) {
    import_fs2.default.mkdirSync(dir, { recursive: true });
  }
  const body = JSON.stringify({ url, token, updatedAt: Date.now() }, null, 2) + "\n";
  const tmpPath = `${configPath}.tmp-${process.pid}`;
  import_fs2.default.writeFileSync(tmpPath, body, { encoding: "utf8", mode: 384 });
  import_fs2.default.renameSync(tmpPath, configPath);
  return configPath;
}
function readHookBridgeConfig(homeDir) {
  const configPath = resolveHookBridgeConfigPath(homeDir);
  try {
    const raw = import_fs2.default.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.url !== "string" || typeof parsed.token !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// src/lib/terminal/opencodeSseClient.js
var import_http = __toESM(require("http"));
var import_https = __toESM(require("https"));
var import_url = require("url");
var OPENCODE_SSE_SOURCE = "opencode-sse";
var OPENCODE_EVENT_MAP = {
  "session.idle": "idle",
  "message.part.delta": "running",
  "message.part.updated": "running",
  "message.updated": "running",
  "session.error": "blocked"
};
var DEFAULT_RECONNECT_BASE_MS = 1e3;
var DEFAULT_RECONNECT_MAX_MS = 3e4;
var DEFAULT_STATUS_POLL_MS = 5e3;
var DEFAULT_SSE_FAILURE_THRESHOLD = 3;
function parseSseBuffer(buffer) {
  const events = [];
  const segments = String(buffer).split(/\r\n|\r|\n/);
  const rest = segments.pop() ?? "";
  let eventName = "message";
  let dataLines = [];
  const dispatch = () => {
    if (dataLines.length > 0) {
      events.push({ event: eventName, data: dataLines.join("\n") });
    }
    eventName = "message";
    dataLines = [];
  };
  for (const line of segments) {
    if (line === "") {
      dispatch();
      continue;
    }
    if (line.startsWith(":")) {
      continue;
    }
    const colonIdx = line.indexOf(":");
    let field;
    let value;
    if (colonIdx === -1) {
      field = line;
      value = "";
    } else {
      field = line.slice(0, colonIdx);
      value = line.slice(colonIdx + 1);
      if (value.startsWith(" ")) value = value.slice(1);
    }
    if (field === "event") {
      eventName = value || "message";
    } else if (field === "data") {
      dataLines.push(value);
    }
  }
  return { events, rest };
}
function interpretOpenCodeSseEvent(sseEvent) {
  let payload = null;
  try {
    payload = JSON.parse(sseEvent.data);
  } catch {
    payload = null;
  }
  const eventType = payload && payload.type || sseEvent.event || "";
  const sessionId = payload?.properties?.sessionID ?? payload?.properties?.sessionId ?? payload?.sessionID ?? payload?.sessionId ?? null;
  const state = Object.prototype.hasOwnProperty.call(OPENCODE_EVENT_MAP, eventType) ? OPENCODE_EVENT_MAP[eventType] : null;
  return { sessionId: sessionId ? String(sessionId) : null, state, eventType };
}
function resolveOpenCodeTargetSession(sessionsMap, sessionId) {
  if (!sessionId) return null;
  const sessions = typeof sessionsMap.values === "function" ? [...sessionsMap.values()] : Object.values(sessionsMap);
  return sessions.find((s) => s?.opencodeSessionId === sessionId || s?.agentSessionId === sessionId) || null;
}
function applyOpenCodeSseDetection(session, state, eventType, sessionId, now = Date.now()) {
  if (!session || !state) return null;
  if (!session.agentType) {
    session.agentType = "opencode";
  }
  if (sessionId && !session.opencodeSessionId) {
    session.opencodeSessionId = sessionId;
  }
  session.hookState = {
    state,
    rawState: state,
    event: eventType,
    at: now,
    source: OPENCODE_SSE_SOURCE,
    agentSessionId: sessionId || session.agentSessionId || null
  };
  const detection = {
    state,
    visibleWorking: state === "running",
    visibleBlocker: state === "blocked",
    visibleIdle: state === "idle"
  };
  const published = session.agentStateMachine ? session.agentStateMachine.publishHook(detection, now) : null;
  if (published) {
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
  }
  return published ? buildAgentStateFrame(session, published.state, { at: now }) : null;
}
function defaultRequestImpl(url, { onData, onError, onClose }) {
  const parsed = new import_url.URL(url);
  const lib = parsed.protocol === "https:" ? import_https.default : import_http.default;
  const req = lib.get(
    url,
    {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache"
      }
    },
    (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        onError(new Error(`opencode SSE HTTP ${res.statusCode}`));
        return;
      }
      res.setEncoding("utf8");
      res.on("data", onData);
      res.on("end", onClose);
      res.on("error", onError);
    }
  );
  req.on("error", onError);
  return {
    abort: () => {
      try {
        req.destroy();
      } catch {
      }
    }
  };
}
function defaultGetJson(url) {
  return new Promise((resolve) => {
    try {
      const parsed = new import_url.URL(url);
      const lib = parsed.protocol === "https:" ? import_https.default : import_http.default;
      const req = lib.get(url, { headers: { Accept: "application/json" } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
        res.on("error", () => resolve(null));
      });
      req.on("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}
function interpretSessionStatusResponse(json) {
  if (!json || typeof json !== "object") return [];
  const toState = (entry) => {
    if (entry && typeof entry === "object") {
      if (typeof entry.busy === "boolean") return entry.busy ? "running" : "idle";
      if (typeof entry.state === "string") return entry.state;
      if (typeof entry.status === "string") return entry.status;
    }
    return null;
  };
  const toSessionId = (entry, key) => entry && (entry.sessionID || entry.sessionId) || key || null;
  const rows = [];
  const source = Array.isArray(json) ? json.map((entry) => [null, entry]) : Object.entries(json.sessions && typeof json.sessions === "object" ? json.sessions : json);
  for (const [key, entry] of source) {
    const state = toState(entry);
    const sessionId = toSessionId(entry, key);
    if (state && sessionId) {
      rows.push({ sessionId: String(sessionId), state });
    }
  }
  return rows;
}
function createOpencodeStatusClient(options = {}) {
  const {
    baseUrl,
    sessions,
    onFrame,
    onStatusChange,
    onEvent,
    logger = null,
    requestImpl = defaultRequestImpl,
    getJsonImpl = defaultGetJson,
    now = () => Date.now(),
    reconnectDelayMs = DEFAULT_RECONNECT_BASE_MS,
    maxReconnectDelayMs = DEFAULT_RECONNECT_MAX_MS,
    statusPollMs = DEFAULT_STATUS_POLL_MS,
    sseFailureThreshold = DEFAULT_SSE_FAILURE_THRESHOLD,
    scheduleTimer = (fn, ms) => setTimeout(fn, ms)
  } = options;
  if (!baseUrl) {
    throw new Error("createOpencodeStatusClient: baseUrl is required");
  }
  const normalizedBase = String(baseUrl).replace(/\/+$/, "");
  const eventUrl = `${normalizedBase}/event`;
  const statusUrl = `${normalizedBase}/session/status`;
  let active = false;
  let connection = null;
  let connected = false;
  let reconnectAttempts = 0;
  let consecutiveSseFailures = 0;
  let buffer = "";
  let reconnectTimer = null;
  let statusPollTimer = null;
  const sessionStatuses = /* @__PURE__ */ new Map();
  function logWarn(...args) {
    if (logger && typeof logger.warn === "function") logger.warn(...args);
  }
  function recordStatus(sessionId, state, eventType, source) {
    if (!sessionId || !state) return;
    const prev = sessionStatuses.get(sessionId);
    sessionStatuses.set(sessionId, { sessionId, state, at: now(), source });
    if (typeof onStatusChange === "function" && (!prev || prev.state !== state)) {
      try {
        onStatusChange({ sessionId, state, eventType, source });
      } catch {
      }
    }
  }
  function applyToSession(sessionId, state, eventType) {
    if (!sessions) return;
    const session = resolveOpenCodeTargetSession(sessions, sessionId);
    if (!session) return;
    const frame = applyOpenCodeSseDetection(session, state, eventType, sessionId, now());
    if (frame && typeof onFrame === "function") {
      try {
        onFrame(session, frame);
      } catch {
      }
    }
  }
  function handleSseEvent(sseEvent) {
    if (typeof onEvent === "function") {
      try {
        onEvent(sseEvent);
      } catch {
      }
    }
    const { sessionId, state, eventType } = interpretOpenCodeSseEvent(sseEvent);
    if (!state) return;
    recordStatus(sessionId, state, eventType, "sse");
    applyToSession(sessionId, state, eventType);
  }
  function onData(chunk) {
    reconnectAttempts = 0;
    consecutiveSseFailures = 0;
    buffer += chunk;
    const { events, rest } = parseSseBuffer(buffer);
    buffer = rest;
    for (const ev of events) {
      handleSseEvent(ev);
    }
  }
  function stopStatusPolling() {
    if (statusPollTimer) {
      try {
        if (typeof clearTimeout === "function") clearTimeout(statusPollTimer);
      } catch {
      }
      statusPollTimer = null;
    }
  }
  async function pollSessionStatus() {
    if (!active) return;
    const json = await getJsonImpl(statusUrl);
    if (!active) return;
    const rows = interpretSessionStatusResponse(json);
    for (const { sessionId, state } of rows) {
      recordStatus(sessionId, state, "session.status", "status");
      applyToSession(sessionId, state, "session.status");
    }
    if (active && consecutiveSseFailures >= sseFailureThreshold) {
      statusPollTimer = scheduleTimer(pollSessionStatus, statusPollMs);
    } else {
      statusPollTimer = null;
    }
  }
  function maybeStartStatusPolling() {
    if (consecutiveSseFailures >= sseFailureThreshold && !statusPollTimer && active) {
      logWarn(
        `[opencode-sse] ${consecutiveSseFailures} consecutive SSE failures \u2014 falling back to /session/status polling`
      );
      statusPollTimer = scheduleTimer(pollSessionStatus, statusPollMs);
    }
  }
  function scheduleReconnect() {
    if (!active) return;
    const delay = Math.min(reconnectDelayMs * 2 ** reconnectAttempts, maxReconnectDelayMs);
    reconnectAttempts += 1;
    reconnectTimer = scheduleTimer(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }
  function handleFailure() {
    connected = false;
    connection = null;
    buffer = "";
    consecutiveSseFailures += 1;
    maybeStartStatusPolling();
    scheduleReconnect();
  }
  function connect() {
    if (!active) return;
    try {
      connection = requestImpl(eventUrl, {
        onData,
        onError: handleFailure,
        onClose: handleFailure
      });
      connected = true;
    } catch {
      handleFailure();
    }
  }
  function start() {
    if (active) return;
    active = true;
    reconnectAttempts = 0;
    consecutiveSseFailures = 0;
    connect();
  }
  function stop() {
    active = false;
    connected = false;
    if (reconnectTimer) {
      try {
        if (typeof clearTimeout === "function") clearTimeout(reconnectTimer);
      } catch {
      }
      reconnectTimer = null;
    }
    stopStatusPolling();
    if (connection) {
      connection.abort();
      connection = null;
    }
    buffer = "";
  }
  function getSessionStatuses() {
    return [...sessionStatuses.values()];
  }
  return {
    start,
    stop,
    connect,
    isConnected: () => connected,
    getSessionStatuses
  };
}
var createOpenCodeSseClient = createOpencodeStatusClient;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ALLOWED_HOOK_STATES,
  ANTIGRAVITY_BRIDGE_SOURCE,
  HOOK_AUTHORITY_TTL_MS,
  OPENCODE_SSE_SOURCE,
  buildSessionHookEnv,
  createOpenCodeSseClient,
  createOpencodeStatusClient,
  ensureAgentDetectionSession,
  generateSessionHookToken,
  handleBridgeHookReport,
  handleHookReport,
  hasFreshHookAuthority,
  ingestAgentDetectionFromFilteredOutput,
  notifyUserInput,
  processOscProgress,
  processOscTitle,
  readHookBridgeConfig,
  resolveHookBridgeConfigPath,
  stripOscTitleSequences,
  tickAgentDetection,
  writeHookBridgeConfig
});
