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
}
