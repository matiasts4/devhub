/**
 * Zed agent identity in DevHub.
 *
 * Registers Zed as an agent in the local agent_registry so other systems can
 * see its status and current task. This is a local SQLite implementation;
 * a Supabase-backed deployment would use the same shape via supabase inserts.
 */

import { getDb } from '@/lib/db/localDb';
import { zedLog } from '../utils/zed-logger';

const ZED_AGENT_ID = 'zed-assistant';
const ZED_AGENT_NAME = 'Zed Assistant';

function getAgentRegistryRow(projectId) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM agent_registry WHERE agent_id = ? AND project_id = ?')
    .get(ZED_AGENT_ID, projectId);
}

export const registerZedAgentTool = {
  name: 'register_zed_agent',
  description: 'Register Zed as an agent in the DevHub agent_registry for the current project.',
  parameters: {
    project_id: {
      type: 'string',
      description: 'Project ID (optional; defaults to current project).',
    },
  },
  async execute(params, context = {}) {
    const project_id =
      params?.project_id || context?.project_id || 'ccafadde-6ff3-480a-83dd-960cd3ed8f1c';

    try {
      const db = getDb();
      const existing = getAgentRegistryRow(project_id);
      const now = new Date().toISOString();

      if (existing) {
        db.prepare(
          `UPDATE agent_registry
           SET status = 'idle', last_heartbeat = ?, updated_at = ?
           WHERE agent_id = ? AND project_id = ?`
        ).run(now, now, ZED_AGENT_ID, project_id);
      } else {
        db.prepare(
          `INSERT INTO agent_registry
           (agent_id, project_id, nombre, modelo_llm, status, last_heartbeat, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(ZED_AGENT_ID, project_id, ZED_AGENT_NAME, 'zed-local', 'idle', now, now, now);
      }

      zedLog.info('TOOL', 'register_zed_agent', { project_id, agent_id: ZED_AGENT_ID });
      return { success: true, agent_id: ZED_AGENT_ID, project_id, registered: !existing };
    } catch (error) {
      return { error: `Failed to register Zed agent: ${error.message}` };
    }
  },
};

export const heartbeatZedAgentTool = {
  name: 'heartbeat_zed_agent',
  description: 'Send a heartbeat for the Zed agent in DevHub.',
  parameters: {
    status: { type: 'string', description: 'Agent status: idle, working, delegating.' },
    current_task_id: { type: 'string', description: 'Optional current task ID.' },
    project_id: {
      type: 'string',
      description: 'Project ID (optional; defaults to current project).',
    },
  },
  async execute(params, context = {}) {
    const project_id =
      params?.project_id || context?.project_id || 'ccafadde-6ff3-480a-83dd-960cd3ed8f1c';
    const status = params?.status || 'idle';
    const current_task_id = params?.current_task_id || null;

    try {
      const db = getDb();
      const existing = getAgentRegistryRow(project_id);
      const now = new Date().toISOString();

      if (existing) {
        db.prepare(
          `UPDATE agent_registry
           SET status = ?, current_task_id = ?, last_heartbeat = ?, updated_at = ?
           WHERE agent_id = ? AND project_id = ?`
        ).run(status, current_task_id, now, now, ZED_AGENT_ID, project_id);
      } else {
        db.prepare(
          `INSERT INTO agent_registry
           (agent_id, project_id, nombre, modelo_llm, status, current_task_id, last_heartbeat, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          ZED_AGENT_ID,
          project_id,
          ZED_AGENT_NAME,
          'zed-local',
          status,
          current_task_id,
          now,
          now,
          now
        );
      }

      zedLog.info('TOOL', 'heartbeat_zed_agent', { project_id, status, current_task_id });
      return { success: true, agent_id: ZED_AGENT_ID, status, current_task_id };
    } catch (error) {
      return { error: `Failed to heartbeat Zed agent: ${error.message}` };
    }
  },
};
