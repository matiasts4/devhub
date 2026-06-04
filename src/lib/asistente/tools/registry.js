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

  // Convert registered tools to Anthropic/MiniMax compatible tool definitions
  // for native function calling (input_schema). This enables reliable tool_use
  // blocks instead of fragile textual TOOL:/PARAM: scraping.
  toAnthropicTools() {
    return Array.from(this.tools.values()).map((tool) => {
      const params = tool.parameters || {};
      const required = Object.keys(params).filter(
        (k) => params[k] && params[k].required === true
      );
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
