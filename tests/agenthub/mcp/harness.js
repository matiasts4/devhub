/**
 * McpTestHarness — Extended test harness for MCP tool testing.
 *
 * Bridges CJS test files with the ESM MCP server by implementing tool
 * handlers directly against a real :memory: SQLite database. This avoids
 * the ESM/CJS interop problem and the auto-connect issue (server.js calls
 * `await server.connect(transport)` at module load time).
 *
 * Each tool handler mirrors the exact logic from devhub-mcp/server.js,
 * ensuring tests validate the real business logic.
 *
 * Usage:
 *   const harness = new McpTestHarness();
 *   await harness.setup();
 *   const result = await harness.invokeTool('list_projects', { status: 'all' });
 *   harness.assertToolResponse(result, ['total', 'projects']);
 *   await harness.teardown();
 */

const { TestHarness } = require('../harness');

class McpTestHarness extends TestHarness {
  constructor(options = {}) {
    super({ dbPath: ':memory:', lockOwner: 'mcp-test', ...options });
    this._tools = new Map();
    this._registerAllTools();
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Setup: create DB, apply schema, ensure MCP-specific tables.
   */
  async setup() {
    this.setupDb();
    this._ensureMcpTables();
    return this;
  }

  /**
   * Teardown: close DB and clear state.
   */
  async teardown() {
    this.teardownDb();
    this._tools.clear();
  }

  /**
   * Create MCP-specific tables not in the base test schema.
   */
  _ensureMcpTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        content TEXT NOT NULL,
        author_type TEXT DEFAULT 'agent',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS agent_memory (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_id TEXT,
        key TEXT NOT NULL,
        tipo TEXT NOT NULL,
        value TEXT NOT NULL,
        embedding TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_agent_memory_project ON agent_memory(project_id);
      CREATE INDEX IF NOT EXISTS idx_agent_memory_tipo ON agent_memory(tipo);
      CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

      CREATE TABLE IF NOT EXISTS task_dependencies (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        depends_on TEXT NOT NULL,
        tipo TEXT DEFAULT 'blocks',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS agent_registry (
        agent_id TEXT PRIMARY KEY,
        project_id TEXT,
        nombre TEXT NOT NULL,
        modelo_llm TEXT,
        status TEXT DEFAULT 'idle',
        current_task_id TEXT,
        last_heartbeat TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS agent_workspaces (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        current_task_id TEXT,
        run_id_or_session_id TEXT,
        repo_root TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        worktree_path TEXT,
        base_branch TEXT NOT NULL,
        base_commit TEXT NOT NULL DEFAULT 'f814998dd05cb491caf8637bf570dbd74b539090',
        branch_name TEXT,
        status TEXT NOT NULL DEFAULT 'planned',
        observed_branch TEXT,
        observed_head TEXT,
        observed_dirty TEXT,
        last_error TEXT,
        last_error_class TEXT,
        recovery_reason TEXT,
        evidence_ref TEXT,
        reservation_token TEXT,
        correlation_id TEXT,
        accepted_at TEXT,
        claimed_at TEXT,
        started_at TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  // ─── Tool Registration ──────────────────────────────────────────────

  /**
   * Register all MCP tool handlers. Each handler mirrors the logic from
   * devhub-mcp/server.js but operates on this harness's in-memory DB.
   */
  _registerAllTools() {
    this._registerProjectTools();
    this._registerTaskTools();
    this._registerMilestoneTools();
    this._registerSwarmTools();
    this._registerWorkspaceTools();
    this._registerDocOpsTools();
    this._registerDashboardTools();
  }

  _leaseNow() {
    return Date.now();
  }

  _leaseExpiry(nowMs = this._leaseNow()) {
    return new Date(nowMs + 120_000).toISOString();
  }

  _isActiveLease(task, nowMs = this._leaseNow()) {
    if (!task) return false;
    const expiresAt = task.lease_expires_at ? new Date(task.lease_expires_at).getTime() : NaN;
    return (
      task.status === 'in_progress' &&
      !!task.assigned_to &&
      !!task.claim_token &&
      Number.isFinite(expiresAt) &&
      expiresAt > nowMs
    );
  }

  _needsLeaseCleanup(task, nowMs = this._leaseNow()) {
    if (!task || task.status !== 'in_progress') return false;
    return !this._isActiveLease(task, nowMs);
  }

  _releaseFields(outcome, nowMs = this._leaseNow()) {
    const statusMap = {
      completed: 'completed',
      paused: 'pending',
      abandoned: 'pending',
      failed: 'blocked',
    };
    return {
      status: statusMap[outcome],
      assigned_to: null,
      claimed_at: null,
      lease_expires_at: null,
      claim_token: null,
      completed_at: outcome === 'completed' ? new Date(nowMs).toISOString() : null,
      updated_at: new Date(nowMs).toISOString(),
    };
  }

  _claimFields(agentId, nowMs = this._leaseNow()) {
    return {
      status: 'in_progress',
      assigned_to: agentId,
      claimed_at: new Date(nowMs).toISOString(),
      lease_expires_at: this._leaseExpiry(nowMs),
      claim_token: `claim-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
      updated_at: new Date(nowMs).toISOString(),
    };
  }

  _cleanupExpiredLeases(projectId = null, agentId = null, nowMs = this._leaseNow()) {
    let sql = "SELECT * FROM tasks WHERE status = 'in_progress'";
    const params = [];
    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    if (agentId) {
      sql += ' AND assigned_to = ?';
      params.push(agentId);
    }

    const staleTasks = this.db
      .prepare(sql)
      .all(...params)
      .filter((task) => this._needsLeaseCleanup(task, nowMs));

    for (const task of staleTasks) {
      const fields = this._releaseFields('abandoned', nowMs);
      this.db
        .prepare(
          `UPDATE tasks
         SET status = ?, assigned_to = NULL, claimed_at = NULL, lease_expires_at = NULL,
             claim_token = NULL, completed_at = NULL, updated_at = ?
         WHERE id = ?`
        )
        .run(fields.status, fields.updated_at, task.id);

      if (task.assigned_to) {
        const active = this._findActiveTask(task.project_id, task.assigned_to, nowMs);
        this.db
          .prepare(
            `UPDATE agent_registry
           SET current_task_id = ?, status = ?, updated_at = ?
           WHERE agent_id = ?`
          )
          .run(
            active?.id || null,
            active ? 'working' : 'idle',
            new Date(nowMs).toISOString(),
            task.assigned_to
          );
      }
    }

    return staleTasks;
  }

  _findActiveTask(projectId, agentId, nowMs = this._leaseNow()) {
    return this.db
      .prepare(
        "SELECT * FROM tasks WHERE project_id = ? AND assigned_to = ? AND status = 'in_progress' ORDER BY claimed_at DESC"
      )
      .all(projectId, agentId)
      .find((task) => this._isActiveLease(task, nowMs));
  }

  _buildExecutionQueue(projectId, { limit = 20, includeBlocked = false } = {}) {
    this._cleanupExpiredLeases(projectId, null);

    const tasks = this.db
      .prepare(
        "SELECT * FROM tasks WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC"
      )
      .all(projectId);
    const allTasks = this.db
      .prepare('SELECT id, status FROM tasks WHERE project_id = ?')
      .all(projectId);
    const deps = this.db.prepare('SELECT * FROM task_dependencies').all();
    const statusMap = Object.fromEntries(allTasks.map((task) => [task.id, task.status]));
    const unlockCounts = deps.reduce((acc, dep) => {
      acc[dep.depends_on] = (acc[dep.depends_on] || 0) + 1;
      return acc;
    }, {});
    const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };

    return tasks
      .map((task) => {
        const taskDeps = deps.filter((dep) => dep.task_id === task.id && dep.tipo === 'blocks');
        const blockingDeps = taskDeps.filter((dep) => statusMap[dep.depends_on] !== 'completed');
        const blocked = blockingDeps.length > 0;
        const score =
          (priorityMap[task.priority] || 2) * 0.4 +
          Number(task.business_value ?? 5) * 0.3 +
          Number(unlockCounts[task.id] || 0) * 0.2;
        return {
          ...task,
          blocked,
          blocking_dependencies: blockingDeps.map((dep) => dep.depends_on),
          blocked_reason: blocked ? blockingDeps[0]?.depends_on || null : null,
          priority_score: blocked ? 0 : score,
        };
      })
      .filter((task) => includeBlocked || !task.blocked)
      .sort((a, b) => b.priority_score - a.priority_score)
      .slice(0, limit);
  }

  _filterCompatibilityQueue(queue, deps, pendingTaskIds) {
    const pendingIds = new Set(pendingTaskIds);
    return queue.filter(
      (task) =>
        !deps.some(
          (dep) =>
            dep.depends_on === task.id && dep.tipo === 'blocks' && pendingIds.has(dep.task_id)
        )
    );
  }

  _claimNextTask(projectId, agentId, { compatibilityMode = false } = {}) {
    const nowMs = this._leaseNow();
    const timestamp = new Date(nowMs).toISOString();
    this._cleanupExpiredLeases(projectId, null, nowMs);

    const activeTask = this._findActiveTask(projectId, agentId, nowMs);
    if (activeTask) {
      this.db
        .prepare(
          `UPDATE agent_registry
         SET status = 'working', current_task_id = ?, last_heartbeat = ?, updated_at = ?
         WHERE agent_id = ?`
        )
        .run(activeTask.id, timestamp, timestamp, agentId);
      return {
        claimed: true,
        reused: true,
        task: activeTask,
        message: 'El agente ya tiene una tarea activa.',
      };
    }

    const queue = this._buildExecutionQueue(projectId, { limit: 20 });
    const pendingTaskIds = this.db
      .prepare("SELECT id FROM tasks WHERE project_id = ? AND status = 'pending'")
      .all(projectId)
      .map((task) => task.id);
    const deps = this.db.prepare('SELECT * FROM task_dependencies').all();
    const candidates = compatibilityMode
      ? this._filterCompatibilityQueue(queue, deps, pendingTaskIds)
      : queue;
    for (const candidate of candidates) {
      const fields = this._claimFields(agentId, nowMs);
      const result = this.db
        .prepare(
          `UPDATE tasks
         SET status = ?, assigned_to = ?, claimed_at = ?, lease_expires_at = ?, claim_token = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`
        )
        .run(
          fields.status,
          fields.assigned_to,
          fields.claimed_at,
          fields.lease_expires_at,
          fields.claim_token,
          fields.updated_at,
          candidate.id
        );
      if (result.changes !== 1) continue;

      this.db
        .prepare(
          `UPDATE agent_registry
         SET status = 'working', current_task_id = ?, last_heartbeat = ?, updated_at = ?
         WHERE agent_id = ?`
        )
        .run(candidate.id, timestamp, timestamp, agentId);

      return {
        claimed: true,
        reused: false,
        task: this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(candidate.id),
        message: 'Tarea reclamada.',
      };
    }

    return { claimed: false, reused: false, task: null, message: 'Sin tareas disponibles' };
  }

  _registerProjectTools() {
    const projectSelectFields =
      'id, name, description, color, status, progress, planning_prompt, planning_status, documentation_policy, created_at, updated_at';

    // list_projects
    this._tools.set('list_projects', async ({ status } = {}) => {
      let query = this._qb('projects')
        .select('id, name, status, progress, color')
        .order('created_at', { ascending: false });
      if (status && status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) return this._err(error.message);
      return this._ok({ total: data.length, projects: data });
    });

    this._tools.set('get_project', async ({ project_id }) => {
      const [projRes, tasksRes, msRes] = await Promise.all([
        this._qb('projects').select(projectSelectFields).eq('id', project_id).single(),
        this._qb('tasks')
          .select('*')
          .eq('project_id', project_id)
          .order('created_at', { ascending: false }),
        this._qb('milestones')
          .select('*')
          .eq('project_id', project_id)
          .order('due_date', { ascending: true }),
      ]);

      if (projRes.error) return this._err(projRes.error.message);
      if (!projRes.data) return this._err('Project not found');

      const tasks = tasksRes.data || [];
      const milestones = msRes.data || [];

      return this._ok({
        project: projRes.data,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
        })),
        milestones: milestones.map((m) => ({
          id: m.id,
          title: m.title,
          status: m.status,
          due_date: m.due_date,
        })),
        summary: {
          total_tasks: tasks.length,
          completed_tasks: tasks.filter((t) => t.status === 'completed').length,
          in_progress: tasks.filter((t) => t.status === 'in_progress').length,
          blocked: tasks.filter((t) => t.status === 'blocked').length,
          milestones_done: milestones.filter((m) => m.status === 'completed').length,
        },
      });
    });

    this._tools.set('update_project', async ({ project_id, ...updates }) => {
      const fields = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      if (Object.keys(fields).length === 0) {
        return this._err('No se proporcionaron campos para actualizar');
      }

      const { data, error } = await this._qb('projects')
        .update(fields)
        .eq('id', project_id)
        .select()
        .single();

      if (error) return this._err(error.message);
      if (!data) return this._err('Project not found');

      return this._ok({ updated: true, project: data });
    });
  }

  _registerTaskTools() {
    // list_tasks
    this._tools.set('list_tasks', async ({ project_id, status, priority } = {}) => {
      let query = this._qb('tasks')
        .select('id, title, status, priority, description')
        .eq('project_id', project_id)
        .order('created_at', { ascending: false });
      if (status && status !== 'all') query = query.eq('status', status);
      if (priority && priority !== 'all') query = query.eq('priority', priority);
      const { data, error } = await query;
      if (error) return this._err(error.message);
      return this._ok({ total: data.length, tasks: data });
    });

    // create_task
    this._tools.set(
      'create_task',
      async ({
        project_id,
        user_id,
        title,
        description,
        status = 'pending',
        priority = 'medium',
        due_date,
        milestone_id,
        assigned_to,
      }) => {
        const { data, error } = await this._qb('tasks')
          .insert({
            project_id,
            user_id,
            title,
            description: description || null,
            milestone_id: milestone_id || null,
            assigned_to: assigned_to || null,
            status,
            priority,
            due_date: due_date || null,
          })
          .select()
          .single();
        if (error) return this._err(error.message);
        return this._ok({ created: true, task: data });
      }
    );

    // update_task
    this._tools.set('update_task', async ({ task_id, status, ...rest }) => {
      const updates = {
        ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
      };
      if (status) {
        updates.status = status;
        if (status === 'completed') updates.completed_at = new Date().toISOString();
      }
      const { data, error } = await this._qb('tasks')
        .update(updates)
        .eq('id', task_id)
        .select()
        .single();
      if (error) return this._err(error.message);
      if (!data) return this._err('Task not found');
      return this._ok({ updated: true, task: data });
    });

    // delete_task
    this._tools.set('delete_task', async ({ task_id }) => {
      const { error } = await this._qb('tasks').delete().eq('id', task_id);
      if (error) return this._err(error.message);
      return this._ok({ deleted: true, task_id });
    });

    // add_task_comment
    this._tools.set('add_task_comment', async ({ task_id, content, author_type = 'agent' }) => {
      const { data, error } = await this._qb('task_comments')
        .insert({ task_id, content, author_type })
        .select()
        .single();
      if (error) return this._err(error.message);
      if (!data) return this._err('Task not found');
      return this._ok({ created: true, comment: data });
    });
  }

  _registerMilestoneTools() {
    this._tools.set('list_milestones', async ({ project_id, status = 'all' } = {}) => {
      let query = this._qb('milestones')
        .select(
          'id, project_id, title, description, status, due_date, assigned_to, created_at, updated_at'
        )
        .eq('project_id', project_id)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) return this._err(error.message);
      return this._ok({ total: data.length, milestones: data });
    });

    this._tools.set(
      'create_milestone',
      async ({
        project_id,
        user_id,
        title,
        description,
        status = 'planned',
        due_date,
        assigned_to,
      }) => {
        const payload = {
          id: `ms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          project_id,
          user_id,
          title,
          description: description || null,
          status,
          due_date: due_date || null,
          assigned_to: assigned_to || null,
        };

        const { data, error } = await this._qb('milestones').insert(payload).select().single();
        if (error) return this._err(error.message);
        return this._ok({ created: true, milestone: data });
      }
    );

    this._tools.set('update_milestone', async ({ milestone_id, ...rest }) => {
      const updates = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      const { data, error } = await this._qb('milestones')
        .update(updates)
        .eq('id', milestone_id)
        .select()
        .single();
      if (error) return this._err(error.message);
      if (!data) return this._err('Milestone not found');
      return this._ok({ updated: true, milestone: data });
    });
  }

  _registerSwarmTools() {
    // register_agent
    this._tools.set('register_agent', async ({ agent_id, project_id, nombre, modelo_llm }) => {
      this._cleanupExpiredLeases(project_id, agent_id);
      const payload = {
        agent_id,
        project_id,
        nombre,
        status: 'idle',
        last_heartbeat: new Date().toISOString(),
      };

      if (modelo_llm !== undefined) {
        payload.modelo_llm = modelo_llm;
      }

      const { data, error } = await this._qb('agent_registry')
        .upsert(payload, { onConflict: 'agent_id' })
        .select()
        .single();
      if (error) return this._err(error.message);
      return this._ok({ success: true, agent: this._normalizeAgentRecord(data) });
    });

    // heartbeat_agent
    this._tools.set('heartbeat_agent', async ({ agent_id }) => {
      this._cleanupExpiredLeases(null, agent_id);
      const activeTask = this.db
        .prepare("SELECT * FROM tasks WHERE assigned_to = ? AND status = 'in_progress'")
        .all(agent_id)
        .find((task) => this._isActiveLease(task));
      const updateData = { last_heartbeat: new Date().toISOString() };
      if (activeTask) {
        updateData.status = 'working';
        updateData.current_task_id = activeTask.id;
      }
      const { data, error } = await this._qb('agent_registry')
        .update(updateData)
        .eq('agent_id', agent_id)
        .select()
        .single();
      if (error) return this._err(error.message);
      if (!data) return this._err(`Agente ${agent_id} no encontrado en registry.`);
      return this._ok({ success: true, agent: this._normalizeAgentRecord(data) });
    });

    // unregister_agent
    this._tools.set('unregister_agent', async ({ agent_id }) => {
      const ownedTasks = this.db
        .prepare("SELECT * FROM tasks WHERE assigned_to = ? AND status = 'in_progress'")
        .all(agent_id);
      for (const task of ownedTasks) {
        const fields = this._releaseFields('abandoned');
        this.db
          .prepare(
            `UPDATE tasks
           SET status = ?, assigned_to = NULL, claimed_at = NULL, lease_expires_at = NULL,
               claim_token = NULL, completed_at = NULL, updated_at = ?
           WHERE id = ?`
          )
          .run(fields.status, fields.updated_at, task.id);
      }
      const { error } = await this._qb('agent_registry').delete().eq('agent_id', agent_id);
      if (error) return this._err(error.message);
      return this._ok({ success: true, message: `Agente ${agent_id} eliminado de registry.` });
    });

    // update_agent_status
    this._tools.set('update_agent_status', async ({ agent_id, status }) => {
      const statusMap = {
        working: 'working',
        running: 'working',
        active: 'working',
        thinking: 'working',
        asking_questions: 'working',
        completed: 'idle',
        idle: 'idle',
        failed: 'error',
        error: 'error',
      };
      const updateData = {
        status: statusMap[status] || 'working',
        last_heartbeat: new Date().toISOString(),
      };
      const { data, error } = await this._qb('agent_registry')
        .update(updateData)
        .eq('agent_id', agent_id)
        .select()
        .single();
      if (error) return this._err(error.message);
      if (!data) return this._err(`Agente ${agent_id} no encontrado en registry.`);
      return this._ok({
        success: true,
        message: 'Estado actualizado en la UI',
        agent: this._normalizeAgentRecord(data),
      });
    });
  }

  _registerWorkspaceTools() {
    const WORKSPACE_STATUSES = [
      'planned',
      'provisioning',
      'ready',
      'active',
      'paused',
      'conflicted',
      'cleanup_pending',
      'completed',
      'failed',
      'orphaned',
    ];
    const TERMINAL = new Set(['completed', 'failed']);
    const BASE_COMMIT = 'f814998dd05cb491caf8637bf570dbd74b539090';
    const SW_2_1_CHECKPOINT = '02d82361449a09e93e5880a08e35e3043617002d';
    const SW_3_1_CHECKPOINT = '4b1e344dcd202c911498af17236fcb86a2a2cb1e';

    const normalizeWorkspace = (row) =>
      row ? { ...row, workspace_id: row.workspace_id || row.id } : null;
    const buildWorkspaceId = (taskId, agentId) => `workspace-${taskId}-${agentId}`;
    const buildAck = (workspace) => ({
      workspace_id: workspace.id,
      task_id: workspace.current_task_id,
      agent_id: workspace.agent_id,
      requested_base_ref: workspace.base_commit,
      reservation_token: workspace.reservation_token,
      correlation_id: workspace.correlation_id,
      status: workspace.status,
      accepted_at: workspace.accepted_at || workspace.updated_at || workspace.created_at || null,
    });

    const validateIdentity = ({ workspace_id, task_id, agent_id, correlation_id }) => {
      const hasWorkspaceId = Boolean(workspace_id);
      const hasTaskIdentity = Boolean(task_id || agent_id);
      const hasCompleteTaskIdentity = Boolean(task_id && agent_id);
      if (!correlation_id) throw new Error('correlation_id es requerido.');
      if (!hasWorkspaceId && hasTaskIdentity && !hasCompleteTaskIdentity) {
        throw new Error('task_id y agent_id deben enviarse juntos.');
      }
      if (!hasWorkspaceId && !hasCompleteTaskIdentity) {
        throw new Error(
          'Se requiere exactamente una identidad: workspace_id o task_id + agent_id.'
        );
      }
      if (hasWorkspaceId && hasTaskIdentity) {
        throw new Error('workspace_id no puede combinarse con task_id o agent_id.');
      }
    };

    const validateWorkspaceRow = (row, existing = null) => {
      const merged = { ...existing, ...row };
      if (!WORKSPACE_STATUSES.includes(merged.status)) {
        throw new Error(`Estado de workspace inválido: ${merged.status}`);
      }
      if (!merged.id) throw new Error('workspace_id es requerido.');
      if (!merged.project_id) throw new Error('project_id es requerido.');
      if (!merged.agent_id) throw new Error('agent_id es requerido.');
      if (!merged.repo_root) throw new Error('repo_root es requerido.');
      if (!merged.workspace_path) throw new Error('workspace_path es requerido.');
      if (!merged.base_branch) throw new Error('base_branch es requerido.');
      if (!merged.base_commit) throw new Error('base_commit es requerido.');
      return merged;
    };

    const getWorkspaceById = (id) =>
      normalizeWorkspace(
        this.db.prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1').get(id)
      );

    const updateWorkspace = (id, updates) => {
      const keys = Object.keys(updates);
      this.db
        .prepare(
          `UPDATE agent_workspaces SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`
        )
        .run(...keys.map((key) => updates[key] ?? null), id);
      return getWorkspaceById(id);
    };

    this._tools.set(
      'prepare_agent_workspace',
      async ({
        workspace_id,
        task_id,
        agent_id,
        requested_base_ref,
        correlation_id,
        reservation_token,
      }) => {
        try {
          validateIdentity({ workspace_id, task_id, agent_id, correlation_id });
          const timestamp = new Date().toISOString();
          let workspace = null;
          let resolvedTaskId = task_id || null;
          let resolvedAgentId = agent_id || null;
          let workspaceId = workspace_id || null;

          if (workspaceId) {
            workspace = getWorkspaceById(workspaceId);
            if (!workspace) return this._err(`Workspace ${workspaceId} no encontrado.`);
            resolvedTaskId = workspace.current_task_id;
            resolvedAgentId = workspace.agent_id;
          } else {
            workspaceId = buildWorkspaceId(task_id, agent_id);
            workspace = normalizeWorkspace(
              this.db
                .prepare(
                  'SELECT * FROM agent_workspaces WHERE current_task_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 1'
                )
                .get(task_id, agent_id)
            );
          }

          if (workspace && workspace.correlation_id === correlation_id) {
            return this._ok({
              accepted: true,
              created: false,
              reused: true,
              ack: buildAck(workspace),
              contract: {
                frozen_base_commit: BASE_COMMIT,
                sw_2_1_checkpoint: SW_2_1_CHECKPOINT,
                sw_3_1_checkpoint: SW_3_1_CHECKPOINT,
              },
            });
          }

          const projectId =
            workspace?.project_id ||
            this.db.prepare('SELECT project_id FROM tasks WHERE id = ? LIMIT 1').get(resolvedTaskId)
              ?.project_id ||
            'control-plane-pending';
          const payload = validateWorkspaceRow(
            {
              id: workspaceId,
              project_id: projectId,
              agent_id: resolvedAgentId,
              current_task_id: resolvedTaskId,
              run_id_or_session_id: null,
              repo_root: process.cwd(),
              workspace_path:
                workspace?.workspace_path || `workspace://${projectId}/${workspaceId}`,
              worktree_path: null,
              base_branch: 'main',
              base_commit: requested_base_ref || BASE_COMMIT,
              branch_name: null,
              status: 'provisioning',
              observed_branch: null,
              observed_head: null,
              observed_dirty: null,
              last_error: null,
              last_error_class: null,
              recovery_reason: null,
              evidence_ref: null,
              reservation_token:
                reservation_token || workspace?.reservation_token || `rsv-${Date.now()}`,
              correlation_id,
              accepted_at: timestamp,
              claimed_at: null,
              started_at: null,
              updated_at: timestamp,
              completed_at: null,
            },
            workspace
          );

          let stored = null;
          let created = false;
          if (!workspace) {
            const keys = Object.keys(payload);
            this.db
              .prepare(
                `INSERT INTO agent_workspaces (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
              )
              .run(...keys.map((key) => payload[key] ?? null));
            stored = getWorkspaceById(workspaceId);
            created = true;
          } else {
            stored = updateWorkspace(workspaceId, {
              base_commit: payload.base_commit,
              status: TERMINAL.has(workspace.status) ? workspace.status : 'provisioning',
              last_error: null,
              last_error_class: null,
              recovery_reason: null,
              reservation_token: payload.reservation_token,
              correlation_id,
              accepted_at: timestamp,
              updated_at: timestamp,
            });
          }

          return this._ok({
            accepted: true,
            created,
            reused: false,
            ack: buildAck(stored),
            contract: {
              frozen_base_commit: BASE_COMMIT,
              sw_2_1_checkpoint: SW_2_1_CHECKPOINT,
              sw_3_1_checkpoint: SW_3_1_CHECKPOINT,
            },
          });
        } catch (e) {
          return this._err(e.message);
        }
      }
    );
  }

  _registerDocOpsTools() {
    const resolveDocumentationPolicy = (value) => this._resolveDocumentationPolicy(value);

    const TOPIC_KEY_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,23})(?:\/[a-z0-9](?:[a-z0-9-]{0,23})){1,3}$/;

    const normalizeTopicKey = (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/\/+/g, '/');

    const validateTopicKey = (value) => {
      const normalized = normalizeTopicKey(value);
      const valid = TOPIC_KEY_REGEX.test(normalized);
      return {
        valid,
        normalized,
        reason: valid
          ? null
          : 'Formato invalido. Usa <dominio>/<subdominio>/<tema> en lowercase, hasta 4 segmentos y guion medio.',
      };
    };

    const estimateTokensFromText = (text) => {
      if (!text) return 0;
      const words = String(text).trim().split(/\s+/).filter(Boolean).length;
      return Math.ceil(words * 1.35);
    };

    // validate_topic_key
    this._tools.set('validate_topic_key', async ({ topic_key }) => {
      const result = validateTopicKey(topic_key);
      return this._ok({
        topic_key,
        normalized_topic_key: result.normalized,
        valid: result.valid,
        reason: result.reason,
        regex: TOPIC_KEY_REGEX.source,
      });
    });

    // build_context_pack
    this._tools.set(
      'build_context_pack',
      async ({ project_id, objective, topic_key, max_evidence = 7, max_tokens_context = 2500 }) => {
        const topicValidation = validateTopicKey(topic_key);
        if (!topicValidation.valid) {
          return this._err(`topic_key invalida: ${topicValidation.reason}`);
        }

        const [projectRes, tasksRes, milestonesRes, memoryRes] = await Promise.all([
          this._qb('projects')
            .select('id, name, description, planning_prompt, planning_status, documentation_policy')
            .eq('id', project_id)
            .single(),
          this._qb('tasks')
            .select('id, title, status, priority, updated_at, created_at')
            .eq('project_id', project_id)
            .order('updated_at', { ascending: false, nullsFirst: false })
            .limit(Math.max(3, max_evidence)),
          this._qb('milestones')
            .select('id, title, status, due_date, updated_at, created_at')
            .eq('project_id', project_id)
            .order('updated_at', { ascending: false, nullsFirst: false })
            .limit(Math.max(3, max_evidence)),
          this._qb('agent_memory')
            .select('id, key, tipo, value, created_at')
            .eq('project_id', project_id)
            .order('created_at', { ascending: false })
            .limit(Math.max(3, max_evidence)),
        ]);

        if (projectRes.error) return this._err(projectRes.error.message);
        if (!projectRes.data) return this._err('Project not found');

        const evidence = [];

        for (const t of tasksRes.data || []) {
          evidence.push({
            type: 'task',
            id: t.id,
            summary: `${t.title} (${t.status})`,
            reason: 'Tarea reciente potencialmente vinculada al objetivo documental',
            recency: t.updated_at || t.created_at || null,
          });
        }

        for (const m of milestonesRes.data || []) {
          evidence.push({
            type: 'milestone',
            id: m.id,
            summary: `${m.title} (${m.status})`,
            reason: 'Hito reciente que puede impactar el canonico',
            recency: m.updated_at || m.created_at || null,
          });
        }

        for (const mem of memoryRes.data || []) {
          evidence.push({
            type: 'memory',
            id: mem.id,
            summary: `${mem.key} [${mem.tipo}]`,
            reason: 'Memoria relevante por topic_key para reducir drift documental',
            recency: mem.created_at || null,
          });
        }

        evidence.sort((a, b) => {
          const av = a.recency ? new Date(a.recency).getTime() : 0;
          const bv = b.recency ? new Date(b.recency).getTime() : 0;
          return bv - av;
        });

        const boundedEvidence = evidence.slice(0, max_evidence);

        const currentCanonicalSummary =
          projectRes.data.planning_prompt?.slice(0, 220) ||
          projectRes.data.description?.slice(0, 220) ||
          'Sin resumen canonico disponible';

        const policy = resolveDocumentationPolicy(projectRes.data.documentation_policy);

        const contextPack = {
          objective,
          project_id,
          topic_key: topicValidation.normalized,
          current_canonical_summary: currentCanonicalSummary,
          constraints: [
            'No reemplazar canonico sin validacion posterior',
            'No inyectar contexto completo por defecto',
            'Priorizar evidencia reciente y relevante',
            policy.documentation_policy_metadata.extraConstraint,
          ],
          documentation_policy: policy.documentation_policy,
          documentation_policy_summary: policy.documentation_policy_summary,
          documentation_policy_metadata: policy.documentation_policy_metadata,
          retrieved_evidence: boundedEvidence,
          open_questions:
            boundedEvidence.length === 0
              ? ['No hay evidencia suficiente. Recuperar mas contexto antes de editar.']
              : [],
          budget: {
            max_tokens_context,
            estimated_tokens: estimateTokensFromText(
              [objective, currentCanonicalSummary, ...boundedEvidence.map((e) => e.summary)].join(
                ' '
              )
            ),
            max_expansions: 2,
            expansion_step_tokens: 1000,
          },
          retrieval_order: ['project', 'tasks/milestones', 'memory'],
          generated_at: new Date().toISOString(),
        };

        return this._ok({
          success: true,
          context_pack: contextPack,
          notes:
            'Este pack es minimo y deterministico. Si no alcanza, solicitar expansion explicita en vez de inyectar todo el historial.',
        });
      }
    );
  }

  _registerDashboardTools() {
    // get_dashboard
    this._tools.set('get_dashboard', async () => {
      const [{ data: projects }, { data: tasks }, { data: milestones }] = await Promise.all([
        this._qb('projects')
          .select('id, name, status, progress, color')
          .order('created_at', { ascending: false }),
        this._qb('tasks').select('project_id, status, priority, due_date'),
        this._qb('milestones')
          .select('id, project_id, title, status, due_date')
          .order('due_date', { ascending: true }),
      ]);

      const today = new Date();
      const dashboard = (projects || []).map((p) => {
        const ptasks = tasks?.filter((t) => t.project_id === p.id) || [];
        const pms = milestones?.filter((m) => m.project_id === p.id) || [];
        return {
          ...p,
          tasks: {
            total: ptasks.length,
            completed: ptasks.filter((t) => t.status === 'completed').length,
            in_progress: ptasks.filter((t) => t.status === 'in_progress').length,
            blocked: ptasks.filter((t) => t.status === 'blocked').length,
            overdue: ptasks.filter(
              (t) => t.due_date && new Date(t.due_date) < today && t.status !== 'completed'
            ).length,
          },
          next_milestone: pms.find((m) => m.status !== 'completed') || null,
        };
      });

      return this._ok({
        total_projects: projects?.length || 0,
        active_projects: projects?.filter((p) => p.status === 'active').length || 0,
        dashboard,
      });
    });

    this._tools.set(
      'get_execution_queue',
      async ({ project_id, limit = 20, include_blocked = false }) => {
        const queue = this._buildExecutionQueue(project_id, {
          limit,
          includeBlocked: include_blocked,
        });
        return this._ok({ total: queue.length, queue });
      }
    );

    // get_project_context
    this._tools.set('get_project_context', async ({ project_id }) => {
      const [projRes, filesRes] = await Promise.all([
        this._qb('projects')
          .select(
            'id, name, description, planning_prompt, planning_status, documentation_policy, created_at'
          )
          .eq('id', project_id)
          .single(),
        this._qb('project_files')
          .select('id, file_name, file_type, content, size_chars, created_at')
          .eq('project_id', project_id)
          .order('created_at', { ascending: true }),
      ]);
      if (projRes.error) return this._err(projRes.error.message);
      if (!projRes.data) return this._err('Project not found');
      const policy = this._resolveDocumentationPolicy(projRes.data.documentation_policy);
      const files = filesRes.data || [];
      const totalChars = files.reduce(
        (acc, f) => acc + (f.size_chars || f.content?.length || 0),
        0
      );
      return this._ok({
        project: {
          id: projRes.data.id,
          name: projRes.data.name,
          description: projRes.data.description,
          planning_prompt: projRes.data.planning_prompt,
          planning_status: projRes.data.planning_status,
          documentation_policy: policy.documentation_policy,
          documentation_policy_summary: policy.documentation_policy_summary,
          documentation_policy_metadata: policy.documentation_policy_metadata,
          created_at: projRes.data.created_at,
        },
        files: files.map((f) => ({
          id: f.id,
          file_name: f.file_name,
          file_type: f.file_type,
          size_chars: f.size_chars || f.content?.length || 0,
          content: f.content,
        })),
        summary: {
          total_files: files.length,
          total_chars: totalChars,
          has_planning_prompt: !!projRes.data.planning_prompt,
          planning_status: projRes.data.planning_status,
          documentation_policy: policy.documentation_policy,
        },
      });
    });

    // get_next_task
    this._tools.set('get_next_task', async ({ project_id, agent_id }) => {
      try {
        const claimed = this._claimNextTask(project_id, agent_id, { compatibilityMode: true });
        if (!claimed.claimed) {
          const nextPending = this._buildExecutionQueue(project_id, {
            limit: 1,
            includeBlocked: true,
          })[0];
          if (nextPending) {
            return this._ok({
              task: null,
              message: 'Todas las tareas pendientes estan bloqueadas.',
            });
          }
          return this._ok({ task: null, message: 'Sin tareas pendientes' });
        }

        return this._ok({ task: claimed.task, message: 'Tarea asignada al agente.' });
      } catch (e) {
        return this._err(e.message);
      }
    });

    this._tools.set('claim_next_task', async ({ project_id, agent_id }) => {
      try {
        return this._ok(this._claimNextTask(project_id, agent_id));
      } catch (e) {
        return this._err(e.message);
      }
    });

    this._tools.set('renew_task_lease', async ({ task_id, agent_id, claim_token }) => {
      const nowMs = this._leaseNow();
      this._cleanupExpiredLeases(null, agent_id, nowMs);
      const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
      if (!task) return this._err('Task not found');
      if (
        !this._isActiveLease(task, nowMs) ||
        task.assigned_to !== agent_id ||
        task.claim_token !== claim_token
      ) {
        return this._err('Lease inválido o expirado para renovar la tarea.');
      }
      const leaseExpiresAt = this._leaseExpiry(nowMs);
      this.db
        .prepare('UPDATE tasks SET lease_expires_at = ?, updated_at = ? WHERE id = ?')
        .run(leaseExpiresAt, new Date(nowMs).toISOString(), task_id);
      this.db
        .prepare(
          'UPDATE agent_registry SET last_heartbeat = ?, current_task_id = ?, status = ?, updated_at = ? WHERE agent_id = ?'
        )
        .run(
          new Date(nowMs).toISOString(),
          task_id,
          'working',
          new Date(nowMs).toISOString(),
          agent_id
        );
      return this._ok({
        renewed: true,
        task: this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id),
        message: 'Lease renovado.',
      });
    });

    this._tools.set('release_task', async ({ task_id, agent_id, claim_token, outcome }) => {
      this._cleanupExpiredLeases(null, agent_id);
      const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
      if (!task) return this._err('Task not found');
      if (
        task.assigned_to !== agent_id ||
        task.claim_token !== claim_token ||
        task.status !== 'in_progress'
      ) {
        return this._err('Lease inválido o ownership inconsistente para liberar la tarea.');
      }

      const fields = this._releaseFields(outcome);
      this.db
        .prepare(
          `UPDATE tasks
         SET status = ?, assigned_to = NULL, claimed_at = NULL, lease_expires_at = NULL,
             claim_token = NULL, completed_at = ?, updated_at = ?
         WHERE id = ?`
        )
        .run(fields.status, fields.completed_at, fields.updated_at, task_id);

      const remaining = this._findActiveTask(task.project_id, agent_id);
      this.db
        .prepare(
          'UPDATE agent_registry SET current_task_id = ?, status = ?, last_heartbeat = ?, updated_at = ? WHERE agent_id = ?'
        )
        .run(
          remaining?.id || null,
          remaining ? 'working' : 'idle',
          new Date().toISOString(),
          new Date().toISOString(),
          agent_id
        );

      return this._ok({
        released: true,
        task: this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id),
        message: 'Tarea liberada.',
      });
    });

    // mark_planning_done
    this._tools.set('mark_planning_done', async ({ project_id }) => {
      const { data, error } = await this._qb('projects')
        .update({ planning_status: 'completed' })
        .eq('id', project_id)
        .select('id, name, planning_status')
        .single();
      if (error) return this._err(error.message);
      if (!data) return this._err('Project not found');
      return this._ok({
        success: true,
        project: data,
        message: 'Planning marcado como completado. El workspace esta listo.',
      });
    });
  }

  _resolveDocumentationPolicy(value) {
    const documentationPolicyMap = {
      archive_only: {
        mode: 'archive-first',
        summary: 'archive_only: Archivar primero antes de editar el canonico.',
        requires_user_clarification: false,
        extraConstraint: 'Archivar primero y documentar el cambio de forma incremental.',
      },
      shared_legacy: {
        mode: 'legacy-preserve',
        summary: 'shared_legacy: preservar compatibilidad y explicitar transiciones.',
        requires_user_clarification: false,
        extraConstraint: 'Preservar compatibilidad legacy mientras migrás al contrato canónico.',
      },
      personal: {
        mode: 'personal-default',
        summary: 'personal: policy local por defecto para trabajo individual.',
        requires_user_clarification: false,
        extraConstraint: 'Mantener el cambio acotado y sin scope creep.',
      },
      unknown: {
        mode: 'unknown',
        summary: 'unknown: falta política documental explícita.',
        requires_user_clarification: true,
        extraConstraint: 'Si falta policy, pedile aclaración antes de alterar el canonico.',
      },
    };

    const key = value || 'unknown';
    const metadata = documentationPolicyMap[key] || documentationPolicyMap.unknown;

    return {
      documentation_policy: key,
      documentation_policy_metadata: metadata,
      documentation_policy_summary: metadata.summary,
    };
  }

  _normalizeAgentRecord(record) {
    if (!record) return record;

    const normalized = { ...record };
    if (normalized.modelo_llm == null) {
      delete normalized.modelo_llm;
    }
    return normalized;
  }

  // ─── LocalQueryBuilder (mirrors server.js) ──────────────────────────

  /**
   * Create a query builder for a table. Mirrors LocalQueryBuilder from server.js.
   */
  _qb(table) {
    return new LocalQueryBuilder(this.db, table);
  }

  // ─── Response helpers ───────────────────────────────────────────────

  _ok(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  _err(msg) {
    return { content: [{ type: 'text', text: `ERROR: ${msg}` }], isError: true };
  }

  /**
   * Parse the text content from a tool response.
   * @param {object} result - The tool response object
   * @returns {object} Parsed JSON body
   */
  parseResponse(result) {
    if (!result || !result.content || !result.content[0]) {
      throw new Error('Invalid tool response: missing content');
    }
    return JSON.parse(result.content[0].text);
  }

  // ─── Public API ─────────────────────────────────────────────────────

  /**
   * Invoke a tool by name with the given input.
   *
   * @param {string} toolName - Name of the tool to invoke
   * @param {object} input - Tool input parameters
   * @returns {Promise<object>} Tool response object
   */
  async invokeTool(toolName, input = {}) {
    const handler = this._tools.get(toolName);
    if (!handler) {
      throw new Error(`Unknown MCP tool: ${toolName}`);
    }
    return handler(input);
  }

  /**
   * Invoke a tool and parse the response body.
   *
   * @param {string} toolName
   * @param {object} input
   * @returns {Promise<object>} Parsed response body
   */
  async invokeAndParse(toolName, input = {}) {
    const result = await this.invokeTool(toolName, input);
    return this.parseResponse(result);
  }

  /**
   * Assert that a tool response contains required fields.
   *
   * @param {object} result - Tool response object
   * @param {string[]} requiredFields - Array of required field names
   */
  assertToolResponse(result, requiredFields) {
    if (!result) throw new Error('Tool response is null/undefined');
    if (!result.content || !Array.isArray(result.content)) {
      throw new Error(`Tool response missing content array: ${JSON.stringify(result)}`);
    }
    if (result.content.length === 0) {
      throw new Error('Tool response has empty content array');
    }

    const body = this.parseResponse(result);
    const missing = requiredFields.filter((field) => !(field in body));
    if (missing.length > 0) {
      throw new Error(`Tool response missing required fields: ${missing.join(', ')}`);
    }
    return body;
  }

  /**
   * Assert that a tool response indicates an error.
   *
   * @param {object} result - Tool response object
   * @param {string} [expectedMessage] - Optional expected error message substring
   */
  assertToolError(result, expectedMessage) {
    if (!result) throw new Error('Tool response is null/undefined');
    if (!result.isError) {
      throw new Error('Expected tool response to be an error, but isError is not set');
    }
    if (expectedMessage) {
      const text = result.content?.[0]?.text || '';
      if (!text.includes(expectedMessage)) {
        throw new Error(`Expected error message to contain "${expectedMessage}", got: "${text}"`);
      }
    }
    return result;
  }

  /**
   * Verify database state after tool execution.
   *
   * @param {string} table - Table name
   * @param {object} where - WHERE conditions
   * @param {object} expected - Expected column values
   * @returns {object} The matched row
   */
  verifyDbState(table, where, expected) {
    const whereClauses = Object.keys(where)
      .map((k) => `${k} = ?`)
      .join(' AND ');
    const values = Object.values(where);
    const row = this.db
      .prepare(`SELECT * FROM ${table} WHERE ${whereClauses} LIMIT 1`)
      .get(...values);

    if (!row) {
      throw new Error(`No row found in ${table} matching ${JSON.stringify(where)}`);
    }

    const mismatches = {};
    for (const [key, expVal] of Object.entries(expected)) {
      const actualVal = row[key];
      if (actualVal !== expVal) {
        mismatches[key] = { expected: expVal, actual: actualVal };
      }
    }

    if (Object.keys(mismatches).length > 0) {
      throw new Error(`DB state mismatch in ${table}:\n${JSON.stringify(mismatches, null, 2)}`);
    }

    return row;
  }
}

// ─── LocalQueryBuilder (extracted from server.js) ─────────────────────

const UUID_REQUIRED_TABLES = new Set(['projects', 'tasks', 'milestones']);
const AUTO_ID_TABLES = new Set([
  'projects',
  'tasks',
  'milestones',
  'task_comments',
  'agent_memory',
  'mcp_connections',
]);

function nowIso() {
  return new Date().toISOString();
}

function generateLegacyId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function generatePrimaryIdForTable(tableName) {
  if (UUID_REQUIRED_TABLES.has(tableName)) {
    const { randomUUID } = require('crypto');
    return randomUUID();
  }
  return generateLegacyId(tableName.replace(/s$/, ''));
}

function parseOrIlike(expression) {
  if (!expression) return [];
  return expression
    .split(',')
    .map((raw) => raw.trim())
    .map((raw) => {
      const match = raw.match(/^([a-zA-Z0-9_]+)\.ilike\.(.+)$/);
      if (!match) return null;
      return { col: match[1], pattern: match[2].replace(/\*/g, '%') };
    })
    .filter(Boolean);
}

function toSqlOrder(orderItems) {
  if (!orderItems || orderItems.length === 0) return '';
  const clauses = orderItems.map(({ col, ascending = true, nullsFirst }) => {
    const dir = ascending ? 'ASC' : 'DESC';
    if (nullsFirst === undefined) return `${col} ${dir}`;
    const nulls = nullsFirst ? 'NULLS FIRST' : 'NULLS LAST';
    return `${col} ${dir} ${nulls}`;
  });
  return ` ORDER BY ${clauses.join(', ')}`;
}

class LocalQueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this._filters = [];
    this._orIlike = [];
    this._orderBy = [];
    this._limit = null;
    this._single = false;
    this._selectFields = '*';
    this._action = 'select';
    this._payload = null;
    this._upsertOptions = null;
    this._count = null;
    this._head = false;
  }

  select(fields = '*', options = {}) {
    if (typeof fields === 'string' && fields.trim().length > 0) {
      this._selectFields = fields;
    }
    this._count = options?.count || null;
    this._head = !!options?.head;
    return this;
  }

  eq(col, val) {
    this._filters.push({ op: 'eq', col, val });
    return this;
  }

  in(col, vals) {
    this._filters.push({ op: 'in', col, val: vals || [] });
    return this;
  }

  or(expression) {
    this._orIlike = parseOrIlike(expression);
    return this;
  }

  order(col, { ascending = true, nullsFirst } = {}) {
    this._orderBy.push({ col, ascending, nullsFirst });
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  insert(data) {
    this._action = 'insert';
    this._payload = data;
    return this;
  }

  update(data) {
    this._action = 'update';
    this._payload = data;
    return this;
  }

  upsert(data, options = {}) {
    this._action = 'upsert';
    this._payload = data;
    this._upsertOptions = options;
    return this;
  }

  delete() {
    this._action = 'delete';
    this._payload = null;
    return this;
  }

  _buildWhere() {
    const clauses = [];
    const params = [];
    for (const f of this._filters) {
      if (f.op === 'eq') {
        clauses.push(`${f.col} = ?`);
        params.push(f.val);
      } else if (f.op === 'in') {
        if (!Array.isArray(f.val) || f.val.length === 0) {
          clauses.push('1 = 0');
        } else {
          clauses.push(`${f.col} IN (${f.val.map(() => '?').join(', ')})`);
          params.push(...f.val);
        }
      }
    }
    if (this._orIlike.length > 0) {
      const orParts = this._orIlike.map((it) => `LOWER(${it.col}) LIKE LOWER(?)`);
      clauses.push(`(${orParts.join(' OR ')})`);
      params.push(...this._orIlike.map((it) => it.pattern));
    }
    return {
      whereSql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  _queryRows(fields = this._selectFields) {
    const { whereSql, params } = this._buildWhere();
    const orderSql = toSqlOrder(this._orderBy);
    const limitSql = Number.isInteger(this._limit) ? ' LIMIT ?' : '';
    const sql = `SELECT ${fields} FROM ${this.table}${whereSql}${orderSql}${limitSql}`;
    const finalParams = Number.isInteger(this._limit) ? [...params, this._limit] : params;
    return this.db.prepare(sql).all(...finalParams);
  }

  _insertRow(row) {
    const payload = { ...row };
    if (payload.id === undefined && AUTO_ID_TABLES.has(this.table)) {
      payload.id = generatePrimaryIdForTable(this.table);
    }
    if (payload.created_at === undefined) payload.created_at = nowIso();
    if (
      payload.updated_at === undefined &&
      ['projects', 'tasks', 'milestones', 'agent_registry'].includes(this.table)
    ) {
      payload.updated_at = nowIso();
    }
    const cols = Object.keys(payload);
    const values = cols.map((k) => payload[k] ?? null);
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.table} (${cols.join(', ')}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...values);
    if (payload.id !== undefined) {
      return this.db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(payload.id);
    }
    if (payload.agent_id !== undefined) {
      return this.db
        .prepare(`SELECT * FROM ${this.table} WHERE agent_id = ?`)
        .get(payload.agent_id);
    }
    return this.db.prepare(`SELECT * FROM ${this.table} ORDER BY rowid DESC LIMIT 1`).get();
  }

  _updateRows() {
    const data = this._payload || {};
    const keys = Object.keys(data);
    if (keys.length === 0) return [];
    const { whereSql, params } = this._buildWhere();
    const setSql = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => data[k] ?? null);
    const sql = `UPDATE ${this.table} SET ${setSql}${whereSql}`;
    this.db.prepare(sql).run(...values, ...params);
    return this._queryRows('*');
  }

  _upsertRows() {
    const rows = Array.isArray(this._payload) ? this._payload : [this._payload];
    const conflict = this._upsertOptions?.onConflict || 'id';
    const results = [];
    for (const row of rows) {
      if (!row || row[conflict] === undefined || row[conflict] === null) {
        results.push(this._insertRow(row || {}));
        continue;
      }
      const existing = this.db
        .prepare(`SELECT * FROM ${this.table} WHERE ${conflict} = ? LIMIT 1`)
        .get(row[conflict]);
      if (!existing) {
        results.push(this._insertRow(row));
        continue;
      }
      const merged = { ...row, updated_at: nowIso() };
      const keys = Object.keys(merged);
      const setSql = keys.map((k) => `${k} = ?`).join(', ');
      const values = keys.map((k) => merged[k] ?? null);
      this.db
        .prepare(`UPDATE ${this.table} SET ${setSql} WHERE ${conflict} = ?`)
        .run(...values, row[conflict]);
      const updated = this.db
        .prepare(`SELECT * FROM ${this.table} WHERE ${conflict} = ? LIMIT 1`)
        .get(row[conflict]);
      results.push(updated);
    }
    return results;
  }

  async execute() {
    try {
      if (this._action === 'select') {
        const rows = this._queryRows(this._selectFields);
        if (this._head && this._count === 'exact') {
          return { data: null, error: null, count: rows.length };
        }
        return {
          data: this._single ? rows[0] || null : rows,
          error: null,
          count: this._count === 'exact' ? rows.length : null,
        };
      }
      if (this._action === 'insert') {
        const rows = Array.isArray(this._payload) ? this._payload : [this._payload];
        const inserted = rows.map((row) => this._insertRow(row));
        return { data: this._single ? inserted[0] || null : inserted, error: null };
      }
      if (this._action === 'update') {
        const updatedRows = this._updateRows();
        return { data: this._single ? updatedRows[0] || null : updatedRows, error: null };
      }
      if (this._action === 'upsert') {
        const upserted = this._upsertRows();
        return { data: this._single ? upserted[0] || null : upserted, error: null };
      }
      if (this._action === 'delete') {
        const { whereSql, params } = this._buildWhere();
        this.db.prepare(`DELETE FROM ${this.table}${whereSql}`).run(...params);
        return { data: null, error: null };
      }
      return { data: null, error: { message: `Accion no soportada: ${this._action}` } };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

module.exports = { McpTestHarness };
