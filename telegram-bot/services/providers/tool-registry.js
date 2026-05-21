/**
 * ToolRegistry — Converts DevHub MCP tools into OpenAI-compatible function
 * calling schemas and executes them when the LLM requests a tool call.
 *
 * Tool tiers:
 *   T1 — Read-only (enabled by default)
 *   T2 — Write tools (require opt-in)
 *   T3 — Destructive (disabled by default)
 */

const logger = require('../../utils/logger');

// ─── Tier configuration ──────────────────────────────────────────────────────

const TIER_CONFIG = {
  1: { enabled: true, label: 'Read-only tools' },
  2: { enabled: false, label: 'Write tools (requires opt-in)' },
  3: { enabled: false, label: 'Destructive tools (disabled)' },
};

// ─── Tool schemas (OpenAI function calling format) ───────────────────────────

const TOOL_SCHEMAS = {
  // ── TIER 1 — Read-only ─────────────────────────────────────────────────────

  get_project_context: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'get_project_context',
        description:
          'Get the complete planning context of a project including prompt and uploaded files.',
        parameters: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the project',
            },
          },
          required: ['project_id'],
        },
      },
    },
  },

  list_projects: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'list_projects',
        description: 'List all projects with their progress and status.',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'paused', 'completed', 'archived', 'all'],
              description: 'Filter by status. Default: all',
            },
          },
        },
      },
    },
  },

  get_project: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'get_project',
        description: 'Get full details of a specific project including tasks and milestones.',
        parameters: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the project',
            },
          },
          required: ['project_id'],
        },
      },
    },
  },

  list_tasks: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'list_tasks',
        description: 'List tasks for a project, optionally filtered by status or priority.',
        parameters: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the project',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'blocked', 'all'],
              description: 'Filter by status',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical', 'all'],
              description: 'Filter by priority',
            },
          },
          required: ['project_id'],
        },
      },
    },
  },

  get_dashboard: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'get_dashboard',
        description:
          'Get a global summary of all projects: task counts, progress, and upcoming milestones.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
  },

  list_milestones: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'list_milestones',
        description: 'List milestones for a project roadmap.',
        parameters: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the project',
            },
            status: {
              type: 'string',
              enum: ['planned', 'in_progress', 'completed', 'at_risk', 'all'],
              description: 'Filter by status',
            },
          },
          required: ['project_id'],
        },
      },
    },
  },

  get_next_task: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'get_next_task',
        description:
          'Get the next prioritized task from the queue using the mathematical priority formula.',
        parameters: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the project',
            },
            agent_id: {
              type: 'string',
              description: 'ID of the agent requesting the task',
            },
          },
          required: ['project_id', 'agent_id'],
        },
      },
    },
  },

  recall_memory: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'recall_memory',
        description:
          'Search agent memory using full-text search. Find past decisions, bugs fixed, patterns, or any context from previous sessions.',
        parameters: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the project',
            },
            query: {
              type: 'string',
              description: 'Free text to search',
            },
            tipo: {
              type: 'string',
              enum: ['fact', 'decision', 'error', 'context', 'all'],
              description: 'Filter by memory type',
            },
            limit: {
              type: 'number',
              description: 'Result limit',
            },
          },
          required: ['project_id', 'query'],
        },
      },
    },
  },

  explore_files: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'explore_files',
        description: 'Explore files in a specific directory. Use "." for project root.',
        parameters: {
          type: 'object',
          properties: {
            dir_path: {
              type: 'string',
              description:
                'Relative path of the directory to explore (e.g. "src/components" or ".")',
            },
          },
          required: ['dir_path'],
        },
      },
    },
  },

  read_file: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read the content of a specific file.',
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Relative path of the file (e.g. "package.json")',
            },
          },
          required: ['file_path'],
        },
      },
    },
  },

  git_diff_review: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'git_diff_review',
        description:
          'Inspect the diff between branches to validate documentation and code changes.',
        parameters: {
          type: 'object',
          properties: {
            branch: {
              type: 'string',
              description: 'The branch to inspect (e.g. the agent branch)',
            },
            base_branch: {
              type: 'string',
              description: 'The branch to compare against, default "main"',
            },
          },
          required: ['branch'],
        },
      },
    },
  },

  get_task_dependencies: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'get_task_dependencies',
        description: 'Get which tasks block or are blocked by a specific task.',
        parameters: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the task',
            },
          },
          required: ['task_id'],
        },
      },
    },
  },

  validate_topic_key: {
    tier: 1,
    schema: {
      type: 'function',
      function: {
        name: 'validate_topic_key',
        description: 'Validate and normalize a topic_key for document retrieval.',
        parameters: {
          type: 'object',
          properties: {
            topic_key: {
              type: 'string',
              description: 'Expected format: <domain>/<subdomain>/<topic>, lowercase and hyphen',
            },
          },
          required: ['topic_key'],
        },
      },
    },
  },

  // ── TIER 2 — Write tools ───────────────────────────────────────────────────

  create_task: {
    tier: 2,
    schema: {
      type: 'function',
      function: {
        name: 'create_task',
        description: 'Create a new task in a DevHub project.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', format: 'uuid' },
            title: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'blocked'],
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            due_date: {
              type: 'string',
              description: 'ISO date YYYY-MM-DD',
            },
            milestone_id: { type: 'string', format: 'uuid' },
          },
          required: ['project_id', 'title'],
        },
      },
    },
  },

  update_task: {
    tier: 2,
    schema: {
      type: 'function',
      function: {
        name: 'update_task',
        description: 'Update status, priority, or other fields of an existing task.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'blocked'],
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            due_date: { type: 'string' },
            milestone_id: { type: 'string', format: 'uuid' },
          },
          required: ['task_id'],
        },
      },
    },
  },

  add_task_comment: {
    tier: 2,
    schema: {
      type: 'function',
      function: {
        name: 'add_task_comment',
        description:
          'Add a comment to a task (useful for agents to leave technical notes or QA log).',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', format: 'uuid' },
            content: { type: 'string' },
            author_type: { type: 'string', enum: ['human', 'agent'] },
          },
          required: ['task_id', 'content'],
        },
      },
    },
  },

  create_milestone: {
    tier: 2,
    schema: {
      type: 'function',
      function: {
        name: 'create_milestone',
        description: 'Create a new milestone in a project roadmap.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', format: 'uuid' },
            title: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            status: {
              type: 'string',
              enum: ['planned', 'in_progress', 'completed', 'at_risk'],
            },
            due_date: {
              type: 'string',
              description: 'ISO date YYYY-MM-DD',
            },
          },
          required: ['project_id', 'title'],
        },
      },
    },
  },

  update_milestone: {
    tier: 2,
    schema: {
      type: 'function',
      function: {
        name: 'update_milestone',
        description: 'Update status or fields of an existing milestone.',
        parameters: {
          type: 'object',
          properties: {
            milestone_id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: {
              type: 'string',
              enum: ['planned', 'in_progress', 'completed', 'at_risk'],
            },
            due_date: { type: 'string' },
          },
          required: ['milestone_id'],
        },
      },
    },
  },

  update_project: {
    tier: 2,
    schema: {
      type: 'function',
      function: {
        name: 'update_project',
        description: 'Update project fields (name, description, progress, status, color).',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            status: {
              type: 'string',
              enum: ['active', 'paused', 'completed', 'archived'],
            },
            progress: {
              type: 'number',
              minimum: 0,
              maximum: 100,
            },
            color: { type: 'string' },
          },
          required: ['project_id'],
        },
      },
    },
  },

  git_branch: {
    tier: 2,
    schema: {
      type: 'function',
      function: {
        name: 'git_branch',
        description: 'Create and/or switch to an isolated Git branch.',
        parameters: {
          type: 'object',
          properties: {
            branch_name: {
              type: 'string',
              description: 'Name of the new branch or branch to switch to',
            },
          },
          required: ['branch_name'],
        },
      },
    },
  },

  git_commit: {
    tier: 2,
    schema: {
      type: 'function',
      function: {
        name: 'git_commit',
        description: 'Make a Git commit with current changes.',
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Commit message',
            },
            files: {
              type: 'string',
              description: 'Specific files to stage (default: all)',
            },
          },
          required: ['message'],
        },
      },
    },
  },

  register_agent: {
    tier: 2,
    schema: {
      type: 'function',
      function: {
        name: 'register_agent',
        description: 'Register a Worker Agent in the swarm or update its status.',
        parameters: {
          type: 'object',
          properties: {
            agent_id: { type: 'string' },
            project_id: { type: 'string', format: 'uuid' },
            nombre: { type: 'string' },
            modelo_llm: { type: 'string' },
          },
          required: ['agent_id', 'project_id', 'nombre'],
        },
      },
    },
  },

  heartbeat_agent: {
    tier: 2,
    schema: {
      type: 'function',
      function: {
        name: 'heartbeat_agent',
        description: 'Renew agent heartbeat signal.',
        parameters: {
          type: 'object',
          properties: {
            agent_id: { type: 'string' },
          },
          required: ['agent_id'],
        },
      },
    },
  },

  update_agent_status: {
    tier: 2,
    schema: {
      type: 'function',
      function: {
        name: 'update_agent_status',
        description: 'Update agent visual status in DevHub Control Center.',
        parameters: {
          type: 'object',
          properties: {
            agent_id: { type: 'string' },
            status: {
              type: 'string',
              enum: [
                'working',
                'running',
                'active',
                'thinking',
                'asking_questions',
                'completed',
                'failed',
                'idle',
                'error',
              ],
            },
            task_description: { type: 'string' },
          },
          required: ['agent_id', 'status'],
        },
      },
    },
  },

  // ── TIER 3 — Destructive ───────────────────────────────────────────────────

  delete_task: {
    tier: 3,
    schema: {
      type: 'function',
      function: {
        name: 'delete_task',
        description: 'Delete a task from DevHub. Irreversible action!',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', format: 'uuid' },
          },
          required: ['task_id'],
        },
      },
    },
  },

  unregister_agent: {
    tier: 3,
    schema: {
      type: 'function',
      function: {
        name: 'unregister_agent',
        description: 'Unregister an agent from the registry, freeing its current task.',
        parameters: {
          type: 'object',
          properties: {
            agent_id: { type: 'string' },
          },
          required: ['agent_id'],
        },
      },
    },
  },
};

// ─── ToolRegistry class ──────────────────────────────────────────────────────

class ToolRegistry {
  /**
   * @param {Object} options
   * @param {number[]} [options.enabledTiers=[1]] - Which tiers to enable
   * @param {string} [options.mcpBaseUrl] - DevHub MCP API base URL
   * @param {number} [options.maxToolCalls=5] - Max tool call iterations per chat
   * @param {number} [options.maxToolResultChars=2000] - Cap on tool result size
   */
  constructor(options = {}) {
    this.enabledTiers = options.enabledTiers || [1]; // Only T1 by default
    this.mcpBaseUrl = options.mcpBaseUrl || process.env.DEVHUB_API_URL || 'http://127.0.0.1:3400';
    this.maxToolCalls = options.maxToolCalls || 5;
    this.maxToolResultChars = options.maxToolResultChars || 2000;
  }

  /**
   * Get all enabled tool schemas for function calling.
   * @returns {Array<Object>} OpenAI function calling schemas
   */
  getEnabledTools() {
    const tools = [];
    for (const [, tool] of Object.entries(TOOL_SCHEMAS)) {
      if (this.enabledTiers.includes(tool.tier)) {
        tools.push(tool.schema);
      }
    }
    return tools;
  }

  /**
   * Enable a specific tier of tools.
   * @param {number} tier
   */
  enableTier(tier) {
    if (!this.enabledTiers.includes(tier)) {
      this.enabledTiers.push(tier);
      logger.info(`Tool tier ${tier} enabled (${TIER_CONFIG[tier]?.label || 'unknown'})`);
    }
  }

  /**
   * Disable a specific tier of tools.
   * @param {number} tier
   */
  disableTier(tier) {
    this.enabledTiers = this.enabledTiers.filter((t) => t !== tier);
    logger.info(`Tool tier ${tier} disabled`);
  }

  /**
   * Check if a specific tool is enabled.
   * @param {string} name
   * @returns {boolean}
   */
  isToolEnabled(name) {
    const toolDef = TOOL_SCHEMAS[name];
    if (!toolDef) return false;
    return this.enabledTiers.includes(toolDef.tier);
  }

  /**
   * Execute a tool call against the DevHub MCP server.
   * @param {Object} toolCall - The tool call from the LLM
   * @param {string} toolCall.name - Tool name
   * @param {Object} toolCall.arguments - Tool arguments
   * @returns {Promise<string>} Tool result as string
   */
  async executeToolCall(toolCall) {
    const { name, arguments: args } = toolCall;

    // Check if tool exists
    const toolDef = TOOL_SCHEMAS[name];
    if (!toolDef) {
      return `Error: Tool "${name}" not found.`;
    }

    // Check if tool tier is enabled
    if (!this.enabledTiers.includes(toolDef.tier)) {
      return `Error: Tool "${name}" is disabled (tier ${toolDef.tier}).`;
    }

    try {
      logger.info(`Executing tool: ${name}(${JSON.stringify(args)})`);

      const response = await fetch(`${this.mcpBaseUrl}/api/mcp/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: name,
          arguments: args,
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        return `Error executing ${name}: ${response.status} ${errorText}`;
      }

      const result = await response.json();
      const resultStr = JSON.stringify(result, null, 2);

      // Truncate if too large
      if (resultStr.length > this.maxToolResultChars) {
        return (
          resultStr.substring(0, this.maxToolResultChars) +
          `\n\n[... truncated, ${resultStr.length - this.maxToolResultChars} more chars]`
        );
      }

      return resultStr;
    } catch (err) {
      logger.error(`Tool execution failed: ${name} - ${err.message}`);
      return `Error executing ${name}: ${err.message}`;
    }
  }

  /**
   * Get tool definition by name.
   * @param {string} name
   * @returns {Object|null}
   */
  getTool(name) {
    return TOOL_SCHEMAS[name] || null;
  }

  /**
   * Get all tool names, optionally filtered by tier.
   * @param {number} [tier] - Filter by tier, or all if not specified
   * @returns {string[]}
   */
  getToolNames(tier) {
    return Object.entries(TOOL_SCHEMAS)
      .filter(([, tool]) => !tier || tool.tier === tier)
      .map(([name]) => name);
  }

  /**
   * Get tool registry statistics.
   * @returns {Object} Stats object
   */
  getStats() {
    const stats = { total: 0, byTier: {}, enabled: 0 };
    for (const [, tool] of Object.entries(TOOL_SCHEMAS)) {
      stats.total++;
      const tierLabel = TIER_CONFIG[tool.tier]?.label || `Tier ${tool.tier}`;
      if (!stats.byTier[tierLabel]) {
        stats.byTier[tierLabel] = { total: 0, enabled: false };
      }
      stats.byTier[tierLabel].total++;
      if (this.enabledTiers.includes(tool.tier)) {
        stats.enabled++;
        stats.byTier[tierLabel].enabled = true;
      }
    }
    return stats;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _registry = null;

/**
 * Get or create the singleton ToolRegistry.
 * @param {Object} [options]
 * @returns {ToolRegistry}
 */
function getToolRegistry(options) {
  if (!_registry) {
    _registry = new ToolRegistry(options);
  }
  return _registry;
}

/**
 * Reset the singleton (useful for testing).
 */
function resetToolRegistry() {
  _registry = null;
}

module.exports = {
  ToolRegistry,
  TOOL_SCHEMAS,
  TIER_CONFIG,
  getToolRegistry,
  resetToolRegistry,
};
