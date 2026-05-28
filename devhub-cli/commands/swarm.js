'use strict';

const { getDb, readAgentRegistrySummary } = require('../lib/db');
const { section, row, divider, isTTY } = require('../lib/format');

const EMPTY_MESSAGE = 'No swarm data available';

/**
 * Fetch project summary: total count + top 5 by progress.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ total: number, top: Array<{ name: string, progress: number }> }}
 */
function fetchProjects(db) {
  const total = db.prepare('SELECT COUNT(*) as cnt FROM projects').get().cnt;
  const top = db.prepare(
    'SELECT name, progress FROM projects ORDER BY progress DESC LIMIT 5'
  ).all();
  return { total, top };
}

/**
 * Fetch queue summary: aggregate task counts by status.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ pending: number, inProgress: number, blocked: number, completed: number }}
 */
function fetchQueue(db) {
  const counts = db.prepare(
    "SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status"
  ).all();

  const result = { pending: 0, inProgress: 0, blocked: 0, completed: 0 };
  for (const c of counts) {
    if (c.status === 'pending') result.pending = c.cnt;
    else if (c.status === 'in_progress') result.inProgress = c.cnt;
    else if (c.status === 'blocked') result.blocked = c.cnt;
    else if (c.status === 'completed') result.completed = c.cnt;
  }
  return result;
}

/**
 * Fetch upcoming milestones (non-completed, ordered by due_date).
 * @param {import('better-sqlite3').Database} db
 * @returns {{ items: Array<{ title: string, due_date: string|null, status: string }> }}
 */
function fetchMilestones(db) {
  const items = db.prepare(
    "SELECT title, due_date, status FROM milestones WHERE status != 'completed' ORDER BY due_date ASC LIMIT 5"
  ).all();
  return { items };
}

/**
 * Fetch agent summary using readAgentRegistrySummary.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ rows: Array, total: number, active: number }}
 */
function fetchAgents(db) {
  try {
    const { rows, total } = readAgentRegistrySummary(db, {});
    const active = rows.filter(r =>
      ['active', 'working', 'running', 'thinking'].includes(r.status)
    ).length;
    return { rows, total, active };
  } catch {
    // agent_registry table may not exist
    return { rows: [], total: 0, active: 0 };
  }
}

/**
 * Render a section in non-TTY key=value format.
 * @param {string} title
 * @param {string[]} pairs
 * @returns {string}
 */
function renderSectionKV(title, pairs) {
  const lines = ['\n--- ' + title + ' ---'];
  if (pairs.length === 0) {
    lines.push(EMPTY_MESSAGE);
  } else {
    lines.push(...pairs);
  }
  return lines.join('\n');
}

/**
 * Render full output (non-compact mode).
 * @param {object} data - { projects, queue, agents, milestones }
 * @param {boolean} tty - Whether TTY mode is active
 * @returns {string}
 */
function renderFull(data, tty) {
  const lines = [];
  const { projects, queue, agents, milestones } = data;

  if (!tty) {
    // Non-TTY: key=value pairs per section
    const projectPairs = [`total=${projects.total}`];
    for (const p of projects.top) {
      projectPairs.push(`project=${p.name}|progress=${p.progress}`);
    }
    lines.push(renderSectionKV('Projects', projects.total > 0 ? projectPairs : []));

    const queuePairs = [
      `pending=${queue.pending}`,
      `in_progress=${queue.inProgress}`,
      `blocked=${queue.blocked}`,
    ];
    const queueHasData = queue.pending + queue.inProgress + queue.blocked + queue.completed > 0;
    lines.push(renderSectionKV('Queue', queueHasData ? queuePairs : []));

    const agentPairs = [`total=${agents.total}`];
    for (const a of agents.rows) {
      agentPairs.push(`agent=${a.agent_id}|status=${a.status || ''}|task=${a.current_task_id || ''}`);
    }
    lines.push(renderSectionKV('Agents', agents.total > 0 ? agentPairs : []));

    const msPairs = [`total=${milestones.items.length}`];
    for (const m of milestones.items) {
      msPairs.push(`milestone=${m.title}|due=${m.due_date || ''}|status=${m.status}`);
    }
    lines.push(renderSectionKV('Milestones', milestones.items.length > 0 ? msPairs : []));
  } else {
    // TTY: formatted sections with helpers
    lines.push(section('Projects'));
    if (projects.total === 0) {
      lines.push(row(EMPTY_MESSAGE, ''));
    } else {
      lines.push(row('Total', projects.total));
      for (const p of projects.top) {
        lines.push(row(p.name, p.progress + '%'));
      }
    }

    lines.push(divider());

    lines.push(section('Queue'));
    const queueTotal = queue.pending + queue.inProgress + queue.blocked + queue.completed;
    if (queueTotal === 0) {
      lines.push(row(EMPTY_MESSAGE, ''));
    } else {
      lines.push(row('Pending', queue.pending));
      lines.push(row('In Progress', queue.inProgress));
      lines.push(row('Blocked', queue.blocked));
    }

    lines.push(divider());

    lines.push(section('Agents'));
    if (agents.total === 0) {
      lines.push(row(EMPTY_MESSAGE, ''));
    } else {
      lines.push(row('Total', agents.total));
      lines.push(row('Active', agents.active));
      for (const a of agents.rows.slice(0, 5)) {
        lines.push(row(a.agent_id, (a.status || 'idle') + (a.current_task_id ? ' → ' + a.current_task_id : '')));
      }
    }

    lines.push(divider());

    lines.push(section('Milestones'));
    if (milestones.items.length === 0) {
      lines.push(row(EMPTY_MESSAGE, ''));
    } else {
      for (const m of milestones.items) {
        const due = m.due_date || 'no date';
        lines.push(row(m.title, due + ' [' + m.status + ']'));
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render compact (single-line summary) output.
 * @param {object} data - { projects, queue, agents, milestones }
 * @param {boolean} tty - Whether TTY mode is active
 * @returns {string}
 */
function renderCompact(data, tty) {
  const { projects, queue, agents, milestones } = data;

  const parts = [];

  // Projects
  if (projects.total === 0) {
    parts.push('Projects: ' + EMPTY_MESSAGE);
  } else {
    parts.push('Projects: ' + projects.total + ' total');
  }

  // Queue
  const queueTotal = queue.pending + queue.inProgress + queue.blocked + queue.completed;
  if (queueTotal === 0) {
    parts.push('Queue: ' + EMPTY_MESSAGE);
  } else {
    parts.push('Queue: ' + queue.pending + ' pending, ' + queue.inProgress + ' in progress, ' + queue.blocked + ' blocked');
  }

  // Agents
  if (agents.total === 0) {
    parts.push('Agents: ' + EMPTY_MESSAGE);
  } else {
    parts.push('Agents: ' + agents.total + ' registered (' + agents.active + ' active)');
  }

  // Milestones
  if (milestones.items.length === 0) {
    parts.push('Milestones: ' + EMPTY_MESSAGE);
  } else {
    parts.push('Milestones: ' + milestones.items.length + ' upcoming');
  }

  if (tty) {
    return section('Swarm Overview') + '\n' + parts.join(' | ') + '\n';
  }

  return '\n--- Swarm Overview ---\n' + parts.join('\n') + '\n';
}

/**
 * `devhub swarm` — composite overview of projects, queue, agents, and milestones.
 * @param {object} opts
 * @param {boolean} [opts.compact] - Show collapsed one-line summaries
 */
function swarmCommand(opts = {}) {
  const db = getDb();

  const data = {
    projects: fetchProjects(db),
    queue: fetchQueue(db),
    agents: fetchAgents(db),
    milestones: fetchMilestones(db),
  };

  const tty = isTTY || process.env.FORCE_TTY === '1';
  const compact = opts.compact === true;

  const output = compact ? renderCompact(data, tty) : renderFull(data, tty);

  process.stdout.write(output);
  process.exit(0);
}

module.exports = swarmCommand;
