export class ToolRegistry {
  constructor() {
    this.tools = new Map()
  }

  register(tool) {
    if (!tool?.name) {
      throw new Error(`Tool registration failed: missing name in ${JSON.stringify(tool)?.slice(0, 100)}`)
    }
    this.tools.set(tool.name, tool)
  }

  list() {
    return Array.from(this.tools.values())
  }

  async execute(name, input, context) {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Unknown tool: ${name}. Available: ${Array.from(this.tools.keys()).join(', ')}`)
    }
    return tool.execute(input, context)
  }
}