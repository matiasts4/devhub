'use strict';

const { Command } = require('commander');
const pkg = require('./package.json');
const { ensureWriteSchema } = require('./lib/db');

// Ensure writable schema columns exist before any command executes
ensureWriteSchema();

const program = new Command();

program
  .name('devhub')
  .description('CLI for DevHub — agent swarm orchestration and operations')
  .version(pkg.version);

// Implemented commands
const statusCommand = require('./commands/status.js');
program
  .command('status')
  .description('Show compact swarm dashboard')
  .action(statusCommand);

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
  .action(taskCommand);

const wsCommand = require('./commands/ws.js');
program
  .command('ws')
  .description('Show workspace detail by ID')
  .action(wsCommand);

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
  .option('--kind <kind>', 'Message kind (directive, status, handoff, decision, risk, approval_request, approval_result)', 'directive')
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

// Stub commands — not yet implemented
const STUB_COMMANDS = [];

STUB_COMMANDS.forEach((name) => {
  program
    .command(name)
    .description('(not yet implemented)')
    .action(() => {
      process.stderr.write(`Command '${name}' is not yet implemented.\n`);
      process.exit(1);
    });
});

// Handle unknown commands
program.on('command:*', () => {
  const [unknownCmd] = program.args;
  process.stderr.write(`error: unknown command '${unknownCmd}'\n`);
  process.exit(2);
});

program.parse(process.argv);
