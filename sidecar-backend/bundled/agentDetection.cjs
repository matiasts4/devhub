var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/terminal/sidecarAgentDetectionEntry.js
var sidecarAgentDetectionEntry_exports = {};
__export(sidecarAgentDetectionEntry_exports, {
  ensureAgentDetectionSession: () => ensureAgentDetectionSession,
  ingestAgentDetectionFromFilteredOutput: () => ingestAgentDetectionFromFilteredOutput,
  processOscProgress: () => processOscProgress,
  processOscTitle: () => processOscTitle,
  stripOscTitleSequences: () => stripOscTitleSequences
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
    case "after_last_horizontal_rule":
      return afterLastHorizontalRule(content);
    case "prompt_box_body": {
      const body = promptBoxBody(content);
      return body === null ? "" : body;
    }
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
  version: "2026.06.10.1",
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
      id: "background_agent_status_working",
      state: "running",
      priority: 120,
      region: "bottom_non_empty_lines(3)",
      visibleWorking: true,
      lineRegex: ["(?i)\\bkimi[-\\w.]*\\s+thinking\\b.*\\[[1-9][0-9]*\\s+agents?\\s+running\\]"]
    },
    {
      id: "moon_spinner_working",
      state: "running",
      priority: 100,
      region: "whole_recent",
      visibleWorking: true,
      lineRegex: ["^\\s*(\u{1F315}|\u{1F316}|\u{1F317}|\u{1F318}|\u{1F311}|\u{1F312}|\u{1F313}|\u{1F314})\\s*$"]
    },
    {
      id: "braille_spinner_working",
      state: "running",
      priority: 90,
      region: "whole_recent",
      visibleWorking: true,
      lineRegex: ["(?i)^\\s*[\\u2800-\\u28FF]+\\s*(thinking\\.\\.\\.|working\\.\\.\\.|using )"]
    }
  ]
};

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
          all: [
            { contains: ["ctrl+c:cancel", "ctrl+enter:interject"] },
            { contains: ["waiting"] }
          ]
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

// src/lib/terminal/agentStateDetection/detector.js
var MANIFESTS = /* @__PURE__ */ new Map([
  ["kimi", kimi_default],
  ["claude", claude_default],
  ["codex", codex_default],
  ["opencode", opencode_default],
  ["grok", grok_default]
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
  hermes: "hermes"
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
  skipStateUpdate: false,
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
  return evaluateManifest(manifest, {
    screen: screen || "",
    oscTitle: options.oscTitle || "",
    oscProgress: options.oscProgress || ""
  });
}

// src/lib/terminal/agentStateDetection/stateMachine.js
var PENDING_IDLE_CAP_MS = 700;
var PENDING_IDLE_CONFIRMATIONS = 3;
var STABLE_VISIBLE_SIGNAL_REFRESH_MS = 800;
var AgentStateMachine = class {
  constructor() {
    this.state = "unknown";
    this.lastVisibleIdle = false;
    this.lastVisibleBlocker = false;
    this.lastVisibleWorking = false;
    this.lastVisibleSignalRefresh = null;
    this.pendingIdle = null;
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
   * Periodically refresh a stable visible blocker so consumers keep noticing it.
   */
  stableVisibleSignalRefreshDue(next, now) {
    const stableVisibleSignal = next.visibleBlocker && this.lastVisibleBlocker;
    if (!stableVisibleSignal) return false;
    if (!this.lastVisibleSignalRefresh) return true;
    return now - this.lastVisibleSignalRefresh >= STABLE_VISIBLE_SIGNAL_REFRESH_MS;
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
   * @returns {object|null} published state or null if unchanged
   */
  publish(detection, now = Date.now()) {
    const next = {
      state: detection.state,
      visibleIdle: detection.visibleIdle,
      visibleWorking: detection.visibleWorking,
      visibleBlocker: detection.visibleBlocker
    };
    const previous = {
      state: this.state,
      visibleIdle: this.lastVisibleIdle,
      visibleWorking: this.lastVisibleWorking,
      visibleBlocker: this.lastVisibleBlocker
    };
    if (this.shouldHoldWorkingToIdle(previous, next, now)) {
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
var AGENT_TUI_TYPES = ["opencode", "kimi", "claude", "codex", "grok", "hermes"];
var AGENT_TUI_PATTERN = new RegExp(
  `\\b(?:${AGENT_TUI_TYPES.map((t) => t === "grok" ? "grok|groc" : t).join("|")})\\b`,
  "i"
);

// src/lib/terminal/extractBottomViewport.js
function extractBottomViewport(buffer, options = {}) {
  const maxLines = Math.max(1, Number(options.maxLines) || 40);
  if (!buffer || typeof buffer !== "string") return "";
  const lines = buffer.split("\n");
  if (lines.length <= maxLines) return buffer;
  return lines.slice(-maxLines).join("\n");
}
var DEFAULT_DETECTION_VIEWPORT_LINES = 40;
var MAX_DETECTION_BUFFER_CHARS = 8192;

// src/lib/terminal/sessionAgentDetector.js
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
  if (session.detectionBuffer.length > MAX_DETECTION_BUFFER_CHARS) {
    session.detectionBuffer = session.detectionBuffer.slice(-MAX_DETECTION_BUFFER_CHARS);
  }
  const screen = extractBottomViewport(session.detectionBuffer, {
    maxLines: session.detectionViewportLines || DEFAULT_DETECTION_VIEWPORT_LINES
  });
  const detected = detectAgentState(session.agentType, screen, {
    oscTitle: session.title || "",
    oscProgress: session.oscProgress || ""
  });
  if (detected.skipStateUpdate) {
    return result;
  }
  const published = session.agentStateMachine.publish(detected, now);
  if (published) {
    session.agentTuiState = published.state;
    session.agentTuiStateAt = now;
    result.published = published;
    result.agentTuiState = published.state;
    result.agentTuiStateAt = now;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ensureAgentDetectionSession,
  ingestAgentDetectionFromFilteredOutput,
  processOscProgress,
  processOscTitle,
  stripOscTitleSequences
});
