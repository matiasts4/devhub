/**
 * DevHub MCP tools exposed to Zed.
 *
 * These tools let Zed read projects, tasks, milestones and the execution queue,
 * and create tasks/milestones by voice.
 */

import { callDevHubMcp } from '../utils/callDevHubMcp';
import { zedLog } from '../utils/zed-logger';

const DEFAULT_USER_ID = 'd9436f02-67b5-4610-904f-e13d81e1b7e5';
const DEFAULT_PROJECT_ID = 'ccafadde-6ff3-480a-83dd-960cd3ed8f1c';

function resolveProjectId(context) {
  return context?.project_id || DEFAULT_PROJECT_ID;
}

function resolveUserId(context) {
  return context?.user_id || DEFAULT_USER_ID;
}

export const listProjectsTool = {
  name: 'list_projects',
  parallel: true,
  description: 'List all projects known to DevHub MCP.',
  parameters: {},
  async execute() {
    zedLog.info('TOOL', 'list_projects', {});
    return callDevHubMcp('list_projects', {});
  },
};

export const getProjectTool = {
  name: 'get_project',
  parallel: true,
  description:
    'Get details for a DevHub project. If no project_id is provided, uses the current DevHub project.',
  parameters: {
    project_id: {
      type: 'string',
      description: 'Project ID (optional; defaults to current project).',
    },
  },
  async execute(params, context = {}) {
    const project_id = params?.project_id || resolveProjectId(context);
    zedLog.info('TOOL', 'get_project', { project_id });
    return callDevHubMcp('get_project', { project_id });
  },
};

export const getProjectContextTool = {
  name: 'get_project_context',
  parallel: true,
  description:
    'Get rich context for a DevHub project: milestones, tasks, queue and recent activity.',
  parameters: {
    project_id: {
      type: 'string',
      description: 'Project ID (optional; defaults to current project).',
    },
  },
  async execute(params, context = {}) {
    const project_id = params?.project_id || resolveProjectId(context);
    zedLog.info('TOOL', 'get_project_context', { project_id });
    return callDevHubMcp('get_project_context', { project_id });
  },
};

export const listTasksTool = {
  name: 'list_tasks',
  parallel: true,
  description: 'List tasks for a DevHub project, optionally filtered by milestone.',
  parameters: {
    project_id: {
      type: 'string',
      description: 'Project ID (optional; defaults to current project).',
    },
    milestone_id: { type: 'string', description: 'Filter by milestone ID.' },
    status: {
      type: 'string',
      description: 'Filter by status: pending, in_progress, qa_ready, completed, all.',
    },
  },
  async execute(params, context = {}) {
    const project_id = params?.project_id || resolveProjectId(context);
    const args = { project_id };
    if (params?.milestone_id) args.milestone_id = params.milestone_id;
    if (params?.status) args.status = params.status;
    zedLog.info('TOOL', 'list_tasks', args);
    return callDevHubMcp('list_tasks', args);
  },
};

export const getExecutionQueueTool = {
  name: 'get_execution_queue',
  parallel: true,
  description: 'Get the current DevHub execution queue for a project.',
  parameters: {
    project_id: {
      type: 'string',
      description: 'Project ID (optional; defaults to current project).',
    },
  },
  async execute(params, context = {}) {
    const project_id = params?.project_id || resolveProjectId(context);
    zedLog.info('TOOL', 'get_execution_queue', { project_id });
    return callDevHubMcp('get_execution_queue', { project_id });
  },
};

export const createTaskTool = {
  name: 'create_task',
  description: 'Create a single task in DevHub MCP.',
  parameters: {
    title: { type: 'string', description: 'Task title.' },
    description: { type: 'string', description: 'Task description.' },
    priority: { type: 'string', description: 'low, medium, high.' },
    milestone_id: { type: 'string', description: 'Optional milestone ID.' },
    project_id: {
      type: 'string',
      description: 'Project ID (optional; defaults to current project).',
    },
  },
  async execute(params, context = {}) {
    const project_id = params?.project_id || resolveProjectId(context);
    const user_id = resolveUserId(context);
    const args = {
      project_id,
      user_id,
      title: params?.title,
      description: params?.description || '',
      priority: params?.priority || 'medium',
    };
    if (params?.milestone_id) args.milestone_id = params.milestone_id;
    zedLog.info('TOOL', 'create_task', { title: args.title });
    return callDevHubMcp('create_task', args);
  },
};

export const bulkCreateTasksTool = {
  name: 'bulk_create_tasks',
  description: 'Create multiple tasks in DevHub MCP at once.',
  parameters: {
    tasks: {
      type: 'array',
      description: 'Array of task objects with title, description, priority, milestone_id.',
    },
    project_id: {
      type: 'string',
      description: 'Project ID (optional; defaults to current project).',
    },
  },
  async execute(params, context = {}) {
    const project_id = params?.project_id || resolveProjectId(context);
    const user_id = resolveUserId(context);
    const tasks = Array.isArray(params?.tasks) ? params.tasks : [];
    zedLog.info('TOOL', 'bulk_create_tasks', { count: tasks.length });
    return callDevHubMcp('bulk_create_tasks', { project_id, user_id, tasks });
  },
};

export const createMilestoneTool = {
  name: 'create_milestone',
  description: 'Create a milestone in DevHub MCP.',
  parameters: {
    title: { type: 'string', description: 'Milestone title.' },
    description: { type: 'string', description: 'Milestone description.' },
    due_date: { type: 'string', description: 'ISO date string.' },
    project_id: {
      type: 'string',
      description: 'Project ID (optional; defaults to current project).',
    },
  },
  async execute(params, context = {}) {
    const project_id = params?.project_id || resolveProjectId(context);
    const user_id = resolveUserId(context);
    const args = {
      project_id,
      user_id,
      title: params?.title,
      description: params?.description || '',
      status: 'planned',
    };
    if (params?.due_date) args.due_date = params.due_date;
    zedLog.info('TOOL', 'create_milestone', { title: args.title });
    return callDevHubMcp('create_milestone', args);
  },
};

export const bulkCreateMilestonesTool = {
  name: 'bulk_create_milestones',
  description: 'Create multiple milestones in DevHub MCP at once.',
  parameters: {
    milestones: { type: 'array', description: 'Array of milestone objects.' },
    project_id: {
      type: 'string',
      description: 'Project ID (optional; defaults to current project).',
    },
  },
  async execute(params, context = {}) {
    const project_id = params?.project_id || resolveProjectId(context);
    const user_id = resolveUserId(context);
    const milestones = Array.isArray(params?.milestones) ? params.milestones : [];
    zedLog.info('TOOL', 'bulk_create_milestones', { count: milestones.length });
    return callDevHubMcp('bulk_create_milestones', { project_id, user_id, milestones });
  },
};
