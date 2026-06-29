/**
 * Agent run supervision tools for Zed.
 *
 * Reads from the local agent_runs / agent_workspaces tables so Zed can
 * monitor delegated agent sessions.
 */

import { getDb } from '@/lib/db/localDb';
import { zedLog } from '../utils/zed-logger';

export const listAgentRunsTool = {
  name: 'list_agent_runs',
  parallel: true,
  description: 'List recent agent runs for a task, agent or workspace.',
  parameters: {
    task_id: { type: 'string', description: 'Filter by task ID.' },
    agent_id: { type: 'string', description: 'Filter by agent ID.' },
    workspace_id: { type: 'string', description: 'Filter by workspace ID.' },
    limit: { type: 'number', description: 'Max results (default 10).' },
  },
  async execute(params = {}) {
    const db = getDb();
    const conditions = [];
    const values = [];

    if (params?.task_id) {
      conditions.push('task_id = ?');
      values.push(params.task_id);
    }
    if (params?.agent_id) {
      conditions.push('agent_id = ?');
      values.push(params.agent_id);
    }
    if (params?.workspace_id) {
      conditions.push('workspace_id = ?');
      values.push(params.workspace_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(params?.limit) || 10, 1), 50);

    try {
      const runs = db
        .prepare(
          `SELECT run_id, workspace_id, task_id, agent_id, status, terminal_reason_class, started_at, completed_at, created_at
           FROM agent_runs ${where}
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(...values, limit);

      zedLog.info('TOOL', 'list_agent_runs', { count: runs.length });
      return { runs };
    } catch (error) {
      return { error: `Failed to list agent runs: ${error.message}` };
    }
  },
};

export const getAgentRunTool = {
  name: 'get_agent_run',
  parallel: true,
  description: 'Get details of a single agent run by run_id.',
  parameters: {
    run_id: { type: 'string', description: 'Run ID.' },
  },
  async execute(params = {}) {
    const run_id = params?.run_id;
    if (!run_id) return { error: 'missing required parameter: run_id' };

    try {
      const db = getDb();
      const run = db
        .prepare(
          `SELECT run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit,
                  status, terminal_reason_class, started_at, completed_at, created_at, updated_at
           FROM agent_runs WHERE run_id = ?`
        )
        .get(run_id);

      if (!run) return { error: 'not_found', message: `Run ${run_id} not found.` };

      zedLog.info('TOOL', 'get_agent_run', { run_id, status: run.status });
      return { run };
    } catch (error) {
      return { error: `Failed to get agent run: ${error.message}` };
    }
  },
};
