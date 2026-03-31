const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../../data/devhub.db');

const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };

function getDb() {
  const db = new Database(DB_PATH, { fileMustExist: false, readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function getDashboard() {
  const db = getDb();
  try {
    const projects = db
      .prepare(
        `
      SELECT id, name, status, progress, color
      FROM projects
      WHERE status = 'active'
      ORDER BY updated_at DESC
    `
      )
      .all();

    const taskCounts = db
      .prepare(
        `
      SELECT project_id,
             COUNT(*)                          AS total,
             SUM(CASE WHEN status = 'completed'    THEN 1 ELSE 0 END) AS completed,
             SUM(CASE WHEN status = 'in_progress'  THEN 1 ELSE 0 END) AS in_progress,
             SUM(CASE WHEN status = 'blocked'      THEN 1 ELSE 0 END) AS blocked
      FROM tasks
      GROUP BY project_id
    `
      )
      .all();

    const taskMap = {};
    for (const row of taskCounts) {
      taskMap[row.project_id] = {
        total: Number(row.total),
        completed: Number(row.completed),
        in_progress: Number(row.in_progress),
        blocked: Number(row.blocked),
      };
    }

    const milestones = db
      .prepare(
        `
      SELECT project_id, title, due_date
      FROM milestones
      WHERE status IN ('planned', 'in_progress')
      ORDER BY due_date ASC
    `
      )
      .all();

    const milestoneMap = {};
    for (const m of milestones) {
      if (!milestoneMap[m.project_id]) {
        milestoneMap[m.project_id] = { title: m.title, due_date: m.due_date };
      }
    }

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      progress: Number(p.progress),
      color: p.color,
      tasks: taskMap[p.id] || { total: 0, completed: 0, in_progress: 0, blocked: 0 },
      next_milestone: milestoneMap[p.id] || null,
    }));
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function getTasks(projectId, { status = ['pending', 'in_progress'], limit = 10 } = {}) {
  const db = getDb();
  try {
    const placeholders = status.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `
      SELECT id, project_id, user_id, title, description, status,
             priority, due_date, completed_at, created_at, updated_at,
             milestone_id, business_value, stale_alert, retry_count,
             last_qa_feedback, assigned_to
      FROM tasks
      WHERE project_id = ?
        AND status IN (${placeholders})
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high'     THEN 2
          WHEN 'medium'   THEN 3
          WHEN 'low'      THEN 4
          ELSE 5
        END ASC,
        created_at ASC
      LIMIT ?
    `
      )
      .all(projectId, ...status, limit);

    return rows.map((r) => ({
      id: r.id,
      project_id: r.project_id,
      user_id: r.user_id,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      due_date: r.due_date,
      completed_at: r.completed_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      milestone_id: r.milestone_id,
      business_value: Number(r.business_value),
      stale_alert: Number(r.stale_alert),
      retry_count: Number(r.retry_count),
      last_qa_feedback: r.last_qa_feedback,
      assigned_to: r.assigned_to,
    }));
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function getProgress(projectId) {
  const db = getDb();
  try {
    const row = db
      .prepare(
        `
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
      FROM tasks
      WHERE project_id = ?
    `
      )
      .get(projectId);

    const total = Number(row.total) || 0;
    const completed = Number(row.completed) || 0;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    const currentMilestone = db
      .prepare(
        `
      SELECT id, title, status, due_date
      FROM milestones
      WHERE project_id = ?
        AND status = 'in_progress'
      ORDER BY created_at ASC
      LIMIT 1
    `
      )
      .get(projectId);

    return {
      total,
      completed,
      percentage,
      current_milestone: currentMilestone || null,
    };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

function getAgents() {
  const db = getDb();
  try {
    const rows = db
      .prepare(
        `
      SELECT id, agent_id, project_id, nombre, modelo_llm,
             status, current_task_id, last_heartbeat,
             created_at, updated_at, error_message
      FROM agent_registry
      ORDER BY last_heartbeat DESC
    `
      )
      .all();

    return rows.map((r) => ({
      id: r.id,
      agent_id: r.agent_id,
      project_id: r.project_id,
      nombre: r.nombre,
      modelo_llm: r.modelo_llm,
      status: r.status,
      current_task_id: r.current_task_id,
      last_heartbeat: r.last_heartbeat,
      created_at: r.created_at,
      updated_at: r.updated_at,
      error_message: r.error_message,
    }));
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Next Task (scoring algorithm)
// ---------------------------------------------------------------------------

function getNextTask(projectId) {
  const db = getDb();
  try {
    // Fetch all pending/in_progress tasks for the project with their blocking dep count
    const tasks = db
      .prepare(
        `
      SELECT t.id, t.title, t.priority, t.business_value, t.due_date,
             t.milestone_id, t.assigned_to, t.description,
             (SELECT COUNT(*)
                FROM task_dependencies td
                JOIN tasks dep ON td.depends_on = dep.id
               WHERE td.task_id = t.id
                 AND dep.status != 'completed') AS blocking_deps
      FROM tasks t
      WHERE t.project_id = ?
        AND t.status IN ('pending', 'in_progress')
    `
      )
      .all(projectId);

    if (tasks.length === 0) return null;

    // Count how many pending tasks each completed dependency unlocks
    const unlockCounts = db
      .prepare(
        `
      SELECT td.depends_on, COUNT(*) AS unlocks
      FROM task_dependencies td
      JOIN tasks t ON td.task_id = t.id
      WHERE t.project_id = ?
        AND t.status IN ('pending', 'in_progress')
      GROUP BY td.depends_on
    `
      )
      .all(projectId);

    const unlockMap = {};
    for (const u of unlockCounts) {
      unlockMap[u.depends_on] = Number(u.unlocks);
    }

    let best = null;
    let bestScore = -Infinity;

    for (const task of tasks) {
      const blockingDeps = Number(task.blocking_deps);

      // Skip tasks with blocking incomplete dependencies
      if (blockingDeps > 0) continue;

      const urgencia = priorityMap[task.priority] || 1;
      const valorNegocio = Number(task.business_value) || 0;
      const depsUnlock = unlockMap[task.id] || 0;

      const score = urgencia * 0.4 + valorNegocio * 0.3 + depsUnlock * 0.2;

      if (score > bestScore) {
        bestScore = score;
        best = task;
      }
    }

    if (!best) return null;

    return {
      id: best.id,
      title: best.title,
      priority: best.priority,
      business_value: Number(best.business_value),
      due_date: best.due_date,
      milestone_id: best.milestone_id,
      assigned_to: best.assigned_to,
      description: best.description,
    };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Agent lifecycle
// ---------------------------------------------------------------------------

function pauseAgent(agentId) {
  const db = getDb();
  try {
    db.prepare(
      `
      UPDATE agent_registry
         SET status = 'paused', updated_at = datetime('now')
       WHERE agent_id = ?
    `
    ).run(agentId);
  } finally {
    db.close();
  }
}

function resumeAgent(agentId) {
  const db = getDb();
  try {
    db.prepare(
      `
      UPDATE agent_registry
         SET status = 'idle', updated_at = datetime('now')
       WHERE agent_id = ?
    `
    ).run(agentId);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Task status
// ---------------------------------------------------------------------------

function updateTaskStatus(taskId, status) {
  const db = getDb();
  try {
    if (status === 'completed') {
      db.prepare(
        `
        UPDATE tasks
           SET status = ?, completed_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?
      `
      ).run(status, taskId);
    } else {
      db.prepare(
        `
        UPDATE tasks
           SET status = ?, updated_at = datetime('now')
         WHERE id = ?
      `
      ).run(status, taskId);
    }
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Project lookup
// ---------------------------------------------------------------------------

function getProjectByName(nameOrId) {
  const db = getDb();
  try {
    // Try exact ID match first
    let project = db
      .prepare(
        `
      SELECT * FROM projects WHERE id = ?
    `
      )
      .get(nameOrId);

    if (!project) {
      // Fallback: name LIKE search
      project = db
        .prepare(
          `
        SELECT * FROM projects WHERE name LIKE ? LIMIT 1
      `
        )
        .get(`%${nameOrId}%`);
    }

    return project || null;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Active projects
// ---------------------------------------------------------------------------

function getActiveProjects() {
  const db = getDb();
  try {
    return db
      .prepare(
        `
      SELECT * FROM projects WHERE status = 'active' ORDER BY updated_at DESC
    `
      )
      .all();
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getDb,
  getDashboard,
  getTasks,
  getProgress,
  getAgents,
  getNextTask,
  pauseAgent,
  resumeAgent,
  updateTaskStatus,
  getProjectByName,
  getActiveProjects,
};
