'use strict';

const { Command } = require('commander');
const pkg = require('./package.json');

// Resolve the DB override before loading lib/db: getDb() is initialized by
// ensureWriteSchema() during CLI startup and would otherwise cache the default.
const dbArgIndex = process.argv.findIndex((arg) => arg === '--db' || arg.startsWith('--db='));
if (dbArgIndex >= 0) {
  const dbArg = process.argv[dbArgIndex];
  const dbPath = dbArg === '--db' ? process.argv[dbArgIndex + 1] : dbArg.slice('--db='.length);
  if (dbPath) process.env.DEVHUB_DB_PATH = dbPath;
}

const { ensureWriteSchema } = require('./lib/db');

// Ensure writable schema columns exist before any command executes
ensureWriteSchema();

const program = new Command();

program
  .name('devhub')
  .description('CLI for DevHub — agent swarm orchestration and operations')
  .version(pkg.version)
  .option(
    '--db <path>',
    'Override DEVHUB_DB_PATH (T-005: used by chat/events/status Bus commands)'
  );

// Implemented commands
const statusCommand = require('./commands/status.js');
program.command('status').description('Show compact swarm dashboard').action(statusCommand);

const queueCommand = require('./commands/queue.js');
program
  .command('queue')
  .description('Show prioritized execution queue')
  .option('--limit <n>', 'Maximum number of rows to display', '20')
  .option('--project <id>', 'Filter by project ID')
  .option('--blocked', 'Show only blocked tasks')
  .action((opts) => {
    queueCommand({
      limit: Number(opts.limit),
      project: opts.project,
      blocked: opts.blocked,
    });
  });

const agentsCommand = require('./commands/agents.js');
program
  .command('agents')
  .description('Show registered swarm agents')
  .option('--status <filter>', 'Filter by exact status match')
  .option('--active', 'Show only active agents (active, working, running, thinking)')
  .action((opts) => {
    agentsCommand({
      status: opts.status,
      active: opts.active,
    });
  });

const swarmCommand = require('./commands/swarm.js');
program
  .command('swarm')
  .description('Show composite swarm overview (projects, queue, agents, milestones)')
  .option('--compact', 'Show collapsed one-line summaries')
  .action(swarmCommand);

const taskCommand = require('./commands/task.js');
program
  .command('task')
  .description('Show task detail by ID')
  .option('--verbose', 'Show full description without truncation')
  .option('--json', 'Output in JSON format')
  .option('--limit <n>', 'Maximum number of history entries to display')
  .action(taskCommand);

const wsCommand = require('./commands/ws.js');
program.command('ws').description('Show workspace detail by ID').action(wsCommand);

const heartbeatCommand = require('./commands/heartbeat.js');
program
  .command('heartbeat')
  .description('Record agent heartbeat (idempotent)')
  .argument('[agent-id]', 'Agent ID')
  .action(heartbeatCommand);

const updateStatusCommand = require('./commands/updateStatus.js');
program
  .command('update-status')
  .description('Update agent status with optional task description')
  .argument('[agent-id]', 'Agent ID')
  .argument('[status]', 'New status value')
  .argument('[task-description]', 'Optional task description')
  .action(updateStatusCommand);

const claimCommand = require('./commands/claim.js');
program
  .command('claim')
  .description('Claim next pending task for an agent')
  .argument('[agent-id]', 'Agent ID')
  .action(claimCommand);

const releaseCommand = require('./commands/release.js');
program
  .command('release')
  .description('Release a claimed task')
  .argument('[task-id]', 'Task ID')
  .argument('[claim-token]', 'Claim token')
  .option('--outcome <value>', 'Outcome: completed, paused, failed, abandoned', 'completed')
  .action(releaseCommand);

const tellCommand = require('./commands/tell.js');
program
  .command('tell')
  .description('Send a mission message to a recipient')
  .argument('[recipient]', 'Recipient agent ID')
  .argument('[message]', 'Message body')
  .option(
    '--kind <kind>',
    'Message kind (directive, status, handoff, decision, risk, approval_request, approval_result)',
    'directive'
  )
  .option('--mission <id>', 'Mission ID (required)')
  .option('--sender <id>', 'Sender agent ID (required)')
  .action((recipient, message, opts) => tellCommand(recipient, message, opts));

const swarmLaunchCommand = require('./commands/swarm-launch.js');
program
  .command('swarm-launch')
  .description('Launch a swarm from a project')
  .argument('[project]', 'Project ID or name')
  .option('--template <id>', 'Template ID (clean-slate, approval-recovery, queue-restart)')
  .option('--swarm-type <id>', 'Swarm type ID (delivery-swarm, recovery-swarm, research-swarm)')
  .option('--team <id>', 'Team ID')
  .option('--provider <id>', 'Provider ID')
  .option('--mission <text>', 'Mission summary')
  .option('--workspace-path <path>', 'Workspace path override')
  .action((project, opts) => {
    if (!project) {
      process.stderr.write('error: project ID or name is required.\n');
      process.exit(1);
    }
    swarmLaunchCommand(project, opts);
  });

// T-016.5 — `devhub swarm logs <launchId>` — prints per-agent transcripts
// captured via tmux pipe-pane (T-016.4). Subcommand of `swarm` is rejected
// by commander (the existing `swarm` command takes no args), so we wire
// this as a top-level `swarm-logs` command for simplicity. The user can
// also type `devhub swarm-logs`.
const { swarmLogsCommand } = require('./commands/swarm-logs.js');
program
  .command('swarm-logs')
  .description('Print per-agent transcripts captured by tmux pipe-pane (T-016.4)')
  .argument('[launch-id]', 'Launch ID (use "latest" or omit for the most recent launch)')
  .option('--role <role>', 'Show only the specified role')
  .option('--list', 'List available transcripts with sizes')
  .action((launchId, opts) => {
    swarmLogsCommand({ launchId, role: opts.role, list: opts.list === true });
  });

// New commands
const authCommand = require('./commands/auth.js');
program
  .command('auth')
  .description('Authentication management (login, status, verify)')
  .allowUnknownOption(true)
  .action(authCommand);

const eventsCommand = require('./commands/events.js');
program
  .command('events')
  .description('Agent events stream and query (list, stream)')
  .allowUnknownOption(true)
  .action(eventsCommand);

const inboxCommand = require('./commands/inbox.js');
program
  .command('inbox')
  .description('Inbox item management (list, read, dismiss)')
  .allowUnknownOption(true)
  .action(inboxCommand);

const presenceCommand = require('./commands/presence.js');
program
  .command('presence')
  .description('Agent presence listing')
  .allowUnknownOption(true)
  .action(presenceCommand);

// T-005 — chat bus command (send, list, watch). Parses --db and other flags from
// process.argv directly (the events/mission commands follow the same pattern).
const chatCommand = require('./commands/chat.js');
program
  .command('chat')
  .description('Agent chat bus (send, list, watch)')
  .allowUnknownOption(true)
  .action(() => {
    // Resolve --db from commander options (T-005) — must run AFTER program.parse().
    const programOpts = program.opts();
    if (programOpts && programOpts.db) {
      process.env.DEVHUB_DB_PATH = programOpts.db;
    }
    const argv = process.argv;
    let chatIdx = -1;
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === 'chat') {
        chatIdx = i;
        break;
      }
    }
    const sub = argv[chatIdx + 1] || 'list';
    const opts = {};
    for (let i = chatIdx + 2; i < argv.length; i++) {
      const a = argv[i];
      if (a && a.startsWith('--')) {
        const k = a.slice(2);
        const v = argv[i + 1];
        opts[k] = v;
        i++;
      }
    }
    chatCommand(sub, opts);
  });

const missionCommand = require('./commands/mission.js');
program
  .command('mission')
  .description('Mission management (list, status, close)')
  .allowUnknownOption(true)
  .action(missionCommand);

const runCommand = require('./commands/run.js');
program
  .command('run')
  .description('Agent run management (list, status)')
  .allowUnknownOption(true)
  .action(runCommand);

const worktreeCommand = require('./commands/worktree.js');
program
  .command('worktree')
  .description('Worktree management (list, status, clean)')
  .allowUnknownOption(true)
  .action(worktreeCommand);

const supervisorCommand = require('./commands/supervisor.js');
program
  .command('supervisor')
  .description('Supervisor status and checkpoint management (status, approve, reject)')
  .allowUnknownOption(true)
  .action(supervisorCommand);

// Handle unknown commands
program.on('command:*', () => {
  const [unknownCmd] = program.args;
  process.stderr.write(`error: unknown command '${unknownCmd}'\n`);
  process.exit(2);
});

program.parse(process.argv);
