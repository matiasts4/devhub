/**
 * Shared Zed tool registry builder.
 *
 * Centralizes registration so both the chat route and the plan-execution
 * endpoint use the exact same tool set.
 */

import path from 'node:path';
import fs from 'node:fs';
import { ToolRegistry } from './tools/registry';
import { SkillRegistry } from './skillRegistry';
import {
  terminalTool,
  listTerminalsTool,
  reviewTerminalTool,
  executeInTerminalTool,
  closeTerminalTool,
  closeAllTerminalsTool,
} from './tools/terminal';
import { summarizeTerminalTool } from './tools/summarizeTerminal';
import { browserTool, closeUrlTool } from './tools/browser';
import { fileTool, reviewLogFileTool } from './tools/files';
import { swarmTool } from './tools/swarm';
import { workspaceActionTool } from './tools/workspace';
import {
  listProjectsTool,
  getProjectTool,
  getProjectContextTool,
  listTasksTool,
  getExecutionQueueTool,
  createTaskTool,
  bulkCreateTasksTool,
  createMilestoneTool,
  bulkCreateMilestonesTool,
} from './tools/devhubMcp';
import { registerZedAgentTool, heartbeatZedAgentTool } from './tools/zedAgent';
import { launchAgentSessionTool, launchSwarmTool } from './tools/agentLauncher';
import { listAgentRunsTool, getAgentRunTool } from './tools/agentRuns';
import { createPlanTool, executePlanTool } from './tools/planner';

const DEFAULT_SKILLS_DIR = path.join(process.cwd(), 'src/lib/asistente/skills');

export function buildZedRegistry({ skillsDir = DEFAULT_SKILLS_DIR } = {}) {
  const registry = new ToolRegistry();
  registry.register(terminalTool);
  registry.register(listTerminalsTool);
  registry.register(reviewTerminalTool);
  registry.register(executeInTerminalTool);
  registry.register(closeTerminalTool);
  registry.register(closeAllTerminalsTool);
  registry.register(summarizeTerminalTool);
  registry.register(browserTool);
  registry.register(closeUrlTool);
  registry.register(fileTool);
  registry.register(reviewLogFileTool);
  registry.register(swarmTool);
  registry.register(workspaceActionTool);
  registry.register(listProjectsTool);
  registry.register(getProjectTool);
  registry.register(getProjectContextTool);
  registry.register(listTasksTool);
  registry.register(getExecutionQueueTool);
  registry.register(createTaskTool);
  registry.register(bulkCreateTasksTool);
  registry.register(createMilestoneTool);
  registry.register(bulkCreateMilestonesTool);
  registry.register(registerZedAgentTool);
  registry.register(heartbeatZedAgentTool);
  registry.register(launchAgentSessionTool);
  registry.register(launchSwarmTool);
  registry.register(listAgentRunsTool);
  registry.register(getAgentRunTool);
  registry.register(createPlanTool);
  registry.register(executePlanTool);

  if (skillsDir && fs.existsSync(skillsDir)) {
    const skillRegistry = new SkillRegistry();
    skillRegistry.discoverFromDirectory(skillsDir);
    registry.registerFromSkillRegistry(skillRegistry);
  }

  return registry;
}

export default buildZedRegistry;
