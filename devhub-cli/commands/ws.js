'use strict';

const { getDb, readWorkspaceEvidenceSummary } = require('../lib/db');
const { section, row, divider, isTTY: formatIsTTY } = require('../lib/format');

/**
 * `devhub ws <id>` — display workspace detail from SQLite.
 * TTY: formatted sections. Non-TTY: key=value pairs.
 */
function wsCommand() {
  // Validate ID argument
  const args = process.argv.slice(3); // ['node', 'bin/devhub', 'ws', ...]
  const id = args.find(a => !a.startsWith('--'));

  if (!id) {
    process.stderr.write('ID required\n');
    process.exit(2);
  }

  const db = getDb();
  const evidence = readWorkspaceEvidenceSummary(db, { workspaceId: id });

  if (!evidence || !evidence.workspace) {
    process.stderr.write('Workspace not found\n');
    process.exit(1);
  }

  const { workspace, latest_run, latest_artifact } = evidence;

  // Support FORCE_TTY for testing
  const forceTTY = process.env.FORCE_TTY === '1';
  const effectiveTTY = forceTTY || formatIsTTY;

  const latestRunStatus = latest_run ? latest_run.status : 'none';
  const latestArtifactKind = latest_artifact ? latest_artifact.kind : 'none';

  if (effectiveTTY) {
    // TTY formatted output
    const lines = [];
    lines.push(section('WORKSPACE'));
    lines.push(row('Workspace ID', workspace.workspace_id || workspace.id || '(none)'));
    lines.push(row('Agent ID', workspace.agent_id || '(none)'));
    lines.push(row('Status', workspace.status || '(none)'));
    lines.push(row('Branch', workspace.branch_name || '(none)'));
    lines.push(row('Current Task', workspace.current_task_id || '(none)'));
    lines.push(divider());
    lines.push(section('LATEST RUN'));
    lines.push(row('Status', latestRunStatus));
    if (latest_run && latest_run.created_at) {
      lines.push(row('Created', latest_run.created_at));
    }
    lines.push(divider());
    lines.push(section('LATEST ARTIFACT'));
    lines.push(row('Kind', latestArtifactKind));
    if (latest_artifact && latest_artifact.summary) {
      lines.push(row('Summary', latest_artifact.summary));
    }
    lines.push('');

    process.stdout.write(lines.join('\n'));
  } else {
    // Non-TTY key=value output
    const lines = [
      `workspace_id=${workspace.workspace_id || workspace.id || ''}`,
      `agent_id=${workspace.agent_id || ''}`,
      `status=${workspace.status || ''}`,
      `branch=${workspace.branch_name || ''}`,
      `current_task=${workspace.current_task_id || ''}`,
      `latest_run=${latestRunStatus}`,
      `latest_artifact=${latestArtifactKind}`,
    ];

    process.stdout.write(lines.join('\n') + '\n');
  }

  process.exit(0);
}

module.exports = wsCommand;
