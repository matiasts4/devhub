'use strict';

/**
 * `devhub supervisor` — supervisor status and checkpoint management.
 * Subcommands: status, approve, reject
 */

const { getDb } = require('../lib/db');
const { section, row } = require('../lib/format');

/**
 * Parse args for supervisor subcommands.
 */
function parseSupervisorArgs() {
  const args = process.argv.slice(3);
  let subcommand = args[0];
  let checkpointId = null;
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--json') {
      options.json = true;
    } else if (!args[i].startsWith('--') && !checkpointId) {
      checkpointId = args[i];
    }
  }

  return { subcommand, checkpointId, options };
}

/**
 * `devhub supervisor status` — show runtime diagnostics.
 */
function supervisorStatus(opts = {}) {
  try {
    const runtimeStatus = require('../../src/lib/swarm/runtimeStatus.js');
    if (!runtimeStatus.createRuntimeDiagnosticsSnapshot) {
      throw new Error('createRuntimeDiagnosticsSnapshot function not available');
    }

    const snapshot = runtimeStatus.createRuntimeDiagnosticsSnapshot({
      db: getDb(),
      logs: {
        terminalLog: '',
        browserLog: '',
        opencodeLog: '',
      },
    });

    if (opts.json) {
      process.stdout.write(JSON.stringify(snapshot) + '\n');
    } else {
      process.stdout.write(section('SUPERVISOR STATUS'));
      process.stdout.write('\n');
      process.stdout.write(row('Process Health', snapshot.processHealth || 'unknown'));
      process.stdout.write('\n');
      process.stdout.write(row('Active Tasks', snapshot.activeTasks || 0));
      process.stdout.write('\n');
      process.stdout.write(row('Pending Approvals', snapshot.pendingApprovals || 0));
      process.stdout.write('\n');
      process.stdout.write(row('Quota Status', snapshot.quotaStatus || 'ok'));
      process.stdout.write('\n\n');
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * `devhub supervisor approve <checkpoint-id>` — approve checkpoint.
 */
function supervisorApprove(checkpointId, opts = {}) {
  if (!checkpointId) {
    process.stderr.write('Checkpoint ID required\n');
    process.exit(2);
  }

  const db = getDb();

  try {
    const supervisor = require('../../src/lib/db/supervisor.js');
    if (!supervisor.upsertSupervisorApprovalCheckpoint) {
      throw new Error('Supervisor functions not available');
    }

    const checkpoint = supervisor.getSupervisorApprovalCheckpoint(db, checkpointId);
    if (!checkpoint) {
      process.stderr.write('Checkpoint not found\n');
      process.exit(1);
    }

    supervisor.upsertSupervisorApprovalCheckpoint(db, {
      checkpoint_key: checkpointId,
      task_id: checkpoint.task_id,
      workspace_id: checkpoint.workspace_id,
      run_id: checkpoint.run_id,
      reason_class: checkpoint.reason_class,
      evidence_ref: checkpoint.evidence_ref,
      status: 'approved',
      decision_note: 'Approved via CLI',
    });

    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ success: true, checkpoint_id: checkpointId, status: 'approved' }) + '\n'
      );
    } else {
      process.stdout.write(`✓ Checkpoint ${checkpointId} approved\n`);
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * `devhub supervisor reject <checkpoint-id>` — reject checkpoint.
 */
function supervisorReject(checkpointId, opts = {}) {
  if (!checkpointId) {
    process.stderr.write('Checkpoint ID required\n');
    process.exit(2);
  }

  const db = getDb();

  try {
    const supervisor = require('../../src/lib/db/supervisor.js');
    if (!supervisor.upsertSupervisorApprovalCheckpoint) {
      throw new Error('Supervisor functions not available');
    }

    const checkpoint = supervisor.getSupervisorApprovalCheckpoint(db, checkpointId);
    if (!checkpoint) {
      process.stderr.write('Checkpoint not found\n');
      process.exit(1);
    }

    supervisor.upsertSupervisorApprovalCheckpoint(db, {
      checkpoint_key: checkpointId,
      task_id: checkpoint.task_id,
      workspace_id: checkpoint.workspace_id,
      run_id: checkpoint.run_id,
      reason_class: checkpoint.reason_class,
      evidence_ref: checkpoint.evidence_ref,
      status: 'rejected',
      decision_note: 'Rejected via CLI',
    });

    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ success: true, checkpoint_id: checkpointId, status: 'rejected' }) + '\n'
      );
    } else {
      process.stdout.write(`✗ Checkpoint ${checkpointId} rejected\n`);
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * Main supervisor command handler.
 */
function supervisorCommand(opts = {}) {
  const { subcommand, checkpointId, options } = parseSupervisorArgs();

  if (!subcommand || subcommand === 'help') {
    process.stdout.write('Usage: devhub supervisor <status|approve|reject> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  status   Show runtime diagnostics\n');
    process.stdout.write('  approve  Approve a checkpoint\n');
    process.stdout.write('  reject   Reject a checkpoint\n');
    process.stdout.write('\nOptions:\n');
    process.stdout.write('  --json   Output JSON\n');
    process.exit(0);
  }

  switch (subcommand) {
    case 'status':
      return supervisorStatus({ ...opts, ...options });
    case 'approve':
      return supervisorApprove(checkpointId, { ...opts, ...options });
    case 'reject':
      return supervisorReject(checkpointId, { ...opts, ...options });
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      process.exit(1);
  }
}

module.exports = supervisorCommand;
