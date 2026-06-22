import { SkillRegistry } from '../skillRegistry';

export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    if (!tool?.name) {
      throw new Error(
        `Tool registration failed: missing name in ${JSON.stringify(tool)?.slice(0, 100)}`
      );
    }
    this.tools.set(tool.name, tool);
  }

  list() {
    return Array.from(this.tools.values());
  }

  // T-014: O(1) lookup by name. Returns the tool definition or `undefined`.
  // Used by the chat route to introspect a tool's `parameters` schema before
  // short-circuiting on empty input (T-015 schema-aware no-params check).
  get(name) {
    return this.tools.get(name);
  }

  async execute(name, input, context) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(
        `Unknown tool: ${name}. Available: ${Array.from(this.tools.keys()).join(', ')}`
      );
    }
    return tool.execute(input, context);
  }

  /**
   * Register all enabled tools exposed by a SkillRegistry instance.
   * @param {import('../skillRegistry').SkillRegistry} skillRegistry
   */
  registerFromSkillRegistry(skillRegistry) {
    if (!skillRegistry || typeof skillRegistry.registerTools !== 'function') {
      throw new Error('Expected a SkillRegistry instance');
    }
    skillRegistry.registerTools(this);
  }

  /**
   * Convenience one-off registration of a skill manifest + handlers.
   * @param {object} manifest
   * @param {Record<string, Function>} handlers
   */
  registerSkillManifest(manifest, handlers) {
    const skillRegistry = new SkillRegistry();
    const result = skillRegistry.registerSkill(manifest, handlers);
    if (!result.success) {
      throw new Error(`Skill registration failed: ${result.error}`);
    }
    this.registerFromSkillRegistry(skillRegistry);
  }

  // Convert registered tools to Anthropic/MiniMax compatible tool definitions
  // for native function calling (input_schema). This enables reliable tool_use
  // blocks instead of fragile textual TOOL:/PARAM: scraping.
  toAnthropicTools() {
    return Array.from(this.tools.values()).map((tool) => {
      const params = tool.parameters || {};
      const required = Object.keys(params).filter((k) => params[k] && params[k].required === true);
      return {
        name: tool.name,
        description: tool.description || '',
        input_schema: {
          type: 'object',
          properties: params,
          ...(required.length ? { required } : {}),
        },
      };
    });
  }
}
