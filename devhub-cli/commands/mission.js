'use strict';

/**
 * `devhub mission` — mission management.
 * Subcommands: list, status, close
 */

const { getDb, readMissionDiagnosticSummary, readMissionListSummary } = require('../lib/db');
const { table, section, row } = require('../lib/format');

/**
 * Parse args for mission subcommands.
 */
function parseMissionArgs() {
  const args = process.argv.slice(3);
  let subcommand = args[0];
  let missionId = null;
  const options = {};
  const evidence = { checks: [], commits: [] };

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--outcome' && args[i + 1]) {
      options.outcome = args[i + 1];
      i++;
    } else if (args[i] === '--summary' && args[i + 1]) {
      options.summary = args[i + 1];
      i++;
    } else if (args[i] === '--check' && args[i + 1]) {
      evidence.checks.push(args[i + 1]);
      i++;
    } else if (args[i] === '--commit' && args[i + 1]) {
      evidence.commits.push(args[i + 1]);
      i++;
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (!args[i].startsWith('--') && !missionId) {
      missionId = args[i];
    }
  }

  if (evidence.checks.length > 0 || evidence.commits.length > 0) {
    options.evidence = evidence;
  }

  return { subcommand, missionId, options };
}

/**
 * `devhub mission list` — list missions.
 */
function missionList(opts = {}) {
  try {
    const missions = readMissionListSummary(getDb(), {});

    if (opts.json) {
      process.stdout.write(JSON.stringify({ missions, count: missions.length }) + '\n');
    } else {
      if (missions.length === 0) {
        process.stdout.write('No missions found.\n');
      } else {
        process.stdout.write(section(`MISSIONS (${missions.length})`));
        process.stdout.write('\n');
        const headers = ['Mission ID', 'Status', 'Summary', 'Created'];
        const rows = missions.map((m) => [
          m.mission_id || '',
          m.status || '',
          (m.summary || '').slice(0, 40),
          m.created_at || '',
        ]);
        process.stdout.write(table(headers, rows));
        process.stdout.write('\n');
      }
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * `devhub mission status <id>` — show mission detail.
 */
function missionStatus(missionId, opts = {}) {
  if (!missionId) {
    process.stderr.write('Mission ID required\n');
    process.exit(2);
  }

  try {
    const summary = readMissionDiagnosticSummary(getDb(), { missionId });

    if (!summary) {
      process.stderr.write('Mission not found\n');
      process.exit(1);
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(summary) + '\n');
    } else {
      const { mission, participants } = summary;
      process.stdout.write(section('MISSION'));
      process.stdout.write('\n');
      process.stdout.write(row('Mission ID', mission.mission_id));
      process.stdout.write('\n');
      process.stdout.write(row('Status', mission.status || '(none)'));
      process.stdout.write('\n');
      process.stdout.write(row('Summary', mission.summary || '(none)'));
      process.stdout.write('\n');
      process.stdout.write(row('Participants', participants.length));
      process.stdout.write('\n');
      process.stdout.write(
        row(
          'Bindings',
          participants
            .map(
              (participant) =>
                `${participant.agent_id}:${participant.binding?.classification || 'missing'}`
            )
            .join(', ')
        )
      );
      process.stdout.write('\n\n');
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * `devhub mission close <id>` — close mission.
 */
function missionClose(missionId, opts = {}) {
  if (!missionId) {
    process.stderr.write('Mission ID required\n');
    process.exit(2);
  }

  const outcome = opts.outcome || 'aborted';
  const summary = opts.summary || 'Mission closed via CLI';
  const evidence = opts.evidence || {};

  if (outcome === 'completed' && !evidence.checks && !evidence.commits) {
    const message = 'Completed outcome requires at least one --check or --commit evidence item';
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ success: false, reason: 'missing_evidence', message }) + '\n'
      );
    } else {
      process.stderr.write(`Error: ${message}\n`);
    }
    process.exit(1);
  }

  try {
    const missionCloseModule = require('../../src/lib/swarm/missionClose.js');
    const result = missionCloseModule.closeMission({
      missionId,
      outcome,
      summary,
      evidence,
    });

    if (opts.json) {
      process.stdout.write(JSON.stringify(result) + '\n');
    } else {
      if (result.success) {
        process.stdout.write(`✓ Mission ${missionId} closed with outcome: ${outcome}\n`);
      } else {
        process.stdout.write(`✗ Failed: ${result.reason}\n`);
      }
    }
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * Main mission command handler.
 */
function missionCommand(opts = {}) {
  const { subcommand, missionId, options } = parseMissionArgs();

  if (!subcommand || subcommand === 'help') {
    process.stdout.write('Usage: devhub mission <list|status|close> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  list     List all missions\n');
    process.stdout.write('  status   Show mission detail\n');
    process.stdout.write('  close    Close a mission\n');
    process.stdout.write('\nOptions:\n');
    process.stdout.write(
      '  --outcome <val>   Outcome: completed|failed|aborted (default: aborted)\n'
    );
    process.stdout.write('  --summary <text>  Summary text (close only)\n');
    process.stdout.write(
      '  --check <text>    Evidence check entry; repeatable (required for completed)\n'
    );
    process.stdout.write(
      '  --commit <sha>    Evidence commit entry; repeatable (required for completed)\n'
    );
    process.stdout.write('  --json            Output JSON\n');
    process.exit(0);
  }

  switch (subcommand) {
    case 'list':
      return missionList({ ...opts, ...options });
    case 'status':
      return missionStatus(missionId, { ...opts, ...options });
    case 'close':
      return missionClose(missionId, { ...opts, ...options });
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      process.exit(1);
  }
}

module.exports = missionCommand;
