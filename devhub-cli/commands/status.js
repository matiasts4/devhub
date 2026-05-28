'use strict';

const { getDb } = require('../lib/db');
const { section, row, divider } = require('../lib/format');

/**
 * `devhub status` — compact swarm dashboard.
 * Queries 4 sections from SQLite and formats output.
 * Capped at 40 lines in TTY mode.
 */
function statusCommand() {
  const db = getDb();

  // Projects
  const projectCount = db.prepare('SELECT COUNT(*) as cnt FROM projects').get().cnt;

  if (projectCount === 0) {
    process.stdout.write('No projects found. Run `devhub init` to get started.\n');
    process.exit(0);
  }

  const topProjects = db.prepare(
    'SELECT name, progress FROM projects ORDER BY progress DESC LIMIT 5'
  ).all();

  // Tasks
  const taskCounts = db.prepare(
    "SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status"
  ).all();

  // Normalize to 4 buckets
  const bucketMap = {};
  for (const s of ['pending', 'in_progress', 'completed', 'blocked']) {
    bucketMap[s] = 0;
  }
  for (const tc of taskCounts) {
    if (tc.status in bucketMap) {
      bucketMap[tc.status] = tc.cnt;
    }
  }

  // Milestones
  const upcomingMilestones = db.prepare(
    "SELECT title, due_date, status FROM milestones WHERE status != 'completed' ORDER BY due_date ASC LIMIT 5"
  ).all();

  // Swarm
  const activeAgents = db.prepare(
    "SELECT COUNT(*) as cnt FROM agent_workspaces WHERE status IN ('active', 'running')"
  ).get().cnt;
  const claimedTasks = db.prepare(
    'SELECT COUNT(*) as cnt FROM agent_workspaces WHERE current_task_id IS NOT NULL'
  ).get().cnt;

  // Assemble output
  const lines = [];

  lines.push(section('Projects'));
  lines.push(row('Total', projectCount));
  for (const p of topProjects) {
    lines.push(row(p.name, p.progress + '%'));
  }

  lines.push(divider());

  lines.push(section('Tasks'));
  lines.push(row('Pending', bucketMap.pending));
  lines.push(row('In Progress', bucketMap.in_progress));
  lines.push(row('Completed', bucketMap.completed));
  lines.push(row('Blocked', bucketMap.blocked));

  lines.push(divider());

  lines.push(section('Milestones'));
  if (upcomingMilestones.length === 0) {
    lines.push(row('(none)', ''));
  } else {
    for (const m of upcomingMilestones) {
      const due = m.due_date || 'no date';
      lines.push(row(m.title, due + ' [' + m.status + ']'));
    }
  }

  lines.push(divider());

  lines.push(section('Swarm'));
  lines.push(row('Active agents', activeAgents));
  lines.push(row('Claimed tasks', claimedTasks));

  lines.push('');

  process.stdout.write(lines.join('\n'));
  process.exit(0);
}

module.exports = statusCommand;
