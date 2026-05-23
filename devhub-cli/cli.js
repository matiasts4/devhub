'use strict';

const { Command } = require('commander');
const pkg = require('./package.json');

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

// Stub commands — not yet implemented
const STUB_COMMANDS = ['agents', 'swarm', 'task', 'ws', 'run'];

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
