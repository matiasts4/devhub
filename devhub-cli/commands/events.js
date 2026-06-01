'use strict';

/**
 * `devhub events` — agent events stream and query.
 * Subcommands: list, stream, tail
 *
 * T-013c: `list` previously routed to a retired HTTP endpoint
 * (`/api/agenthub/events` → 410). Now calls the devhub-bus binary
 * directly: `event-list --mission <id> [--limit <n>]`.
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BUS_BIN = path.resolve(__dirname, '../bin/devhub-bus.js');

function resolveDbPath() {
  return process.env.DEVHUB_DB_PATH || null;
}

/**
 * Parse args for events subcommands.
 * @returns {object} { subcommand, options }
 */
function parseEventsArgs() {
  // T-005 — handle program-level --db option (commander consumes it). Find 'events' in argv.
  const args = process.argv;
  let eventsIdx = -1;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === 'events') {
      eventsIdx = i;
      break;
    }
  }
  const subcommand = eventsIdx >= 0 ? args[eventsIdx + 1] : args[3];
  const sliceFrom = eventsIdx >= 0 ? eventsIdx + 1 : 3;
  const options = {};

  for (let i = sliceFrom + 1; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) {
      options.agentId = args[i + 1];
      i++;
    } else if (args[i] === '--type' && args[i + 1]) {
      options.eventType = args[i + 1];
      i++;
    } else if (args[i] === '--since' && args[i + 1]) {
      options.since = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--interval' && args[i + 1]) {
      options.interval = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--mission' && args[i + 1]) {
      options.mission = args[i + 1];
      i++;
    } else if (args[i] === '--json') {
      options.json = true;
    }
  }

  return { subcommand, options };
}

/**
 * T-005 — `devhub events tail` — tail the JSONL projection for a mission.
 * @param {object} opts
 */
function eventsTail(opts = {}) {
  if (!opts.mission) {
    process.stderr.write('error: events tail requires --mission.\n');
    process.exit(64);
  }
  const dir = `/tmp/devhub-mission-${opts.mission}`;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'events.jsonl');
  if (!fs.existsSync(file)) fs.writeFileSync(file, '');
  const tail = spawn('tail', ['-F', '--retry', '-n', '+1', file], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  tail.stdout.on('data', (chunk) => process.stdout.write(chunk));
  process.on('SIGINT', () => {
    tail.kill('SIGTERM');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    tail.kill('SIGTERM');
    process.exit(0);
  });
}

/**
 * `devhub events list` — fetch events for a mission from the local bus.
 *
 * T-013c: replaced the retired `/api/agenthub/events` HTTP path with a
 * direct spawn of the devhub-bus binary. The CLI accepts the same
 * option shape (`--mission`, `--limit`) but the call is now purely
 * local: no auth, no network.
 *
 * @param {object} opts
 */
function eventsList(opts = {}) {
  if (!opts.mission) {
    process.stderr.write('error: events list requires --mission.\n');
    process.exit(64);
  }
  const dbPath = resolveDbPath();
  if (!dbPath) {
    process.stderr.write('error: events list requires DEVHUB_DB_PATH or --db flag.\n');
    process.exit(64);
  }
  if (!fs.existsSync(BUS_BIN)) {
    process.stderr.write(`error: devhub-bus binary not found at ${BUS_BIN}\n`);
    process.exit(73);
  }

  const args = [BUS_BIN, '--db', dbPath, 'event-list', '--mission', opts.mission];
  const limit = Number(opts.limit) || 50;
  if (limit) args.push('--limit', String(limit));

  const r = spawnSync('node', args, { encoding: 'utf-8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || `event-list exited ${r.status}\n`);
    process.exit(r.status || 1);
  }

  let events;
  try {
    events = JSON.parse(r.stdout.trim() || '[]');
  } catch (e) {
    process.stderr.write(`error: failed to parse event-list output: ${e.message}\n`);
    process.exit(1);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ count: events.length, events }) + '\n');
  } else if (events.length === 0) {
    process.stdout.write('No events found.\n');
  } else {
    process.stdout.write(`\n=== Events (${events.length}) ===\n\n`);
    for (const evt of events) {
      const payload = evt.payload_json ? `\n  ${evt.payload_json}` : '';
      process.stdout.write(
        `[${evt.ts}] ${evt.kind} — ${evt.source_role} (${evt.dedupe_key})${payload}\n`
      );
    }
  }
  process.exit(0);
}

/**
 * `devhub events stream` — poll events with cursor (local bus).
 * T-013c: replaced the retired `/api/agenthub/events` HTTP path with a
 * direct spawn of devhub-bus event-list. Filtering is best-effort
 * post-fetch (the binary does mission+limit+order, not since).
 *
 * @param {object} opts
 */
function eventsStream(opts = {}) {
  if (!opts.mission) {
    process.stderr.write('error: events stream requires --mission.\n');
    process.exit(64);
  }
  const dbPath = resolveDbPath();
  if (!dbPath) {
    process.stderr.write('error: events stream requires DEVHUB_DB_PATH or --db flag.\n');
    process.exit(64);
  }
  const interval = Number(opts.interval) || 1500;
  const seen = new Set();

  process.stdout.write(
    `Streaming events for mission=${opts.mission} (polling every ${interval}ms)...\n`
  );
  process.stdout.write('Press Ctrl+C to stop.\n\n');

  const poll = () => {
    const args = [
      BUS_BIN,
      '--db',
      dbPath,
      'event-list',
      '--mission',
      opts.mission,
      '--limit',
      '50',
    ];
    const r = spawnSync('node', args, { encoding: 'utf-8' });
    if (r.status !== 0) {
      process.stderr.write(`Poll error: ${r.stderr || r.status}\n`);
      return;
    }
    let events;
    try {
      events = JSON.parse(r.stdout.trim() || '[]');
    } catch (e) {
      process.stderr.write(`Poll parse error: ${e.message}\n`);
      return;
    }
    for (const evt of events) {
      if (seen.has(evt.id)) continue;
      seen.add(evt.id);
      if (opts.json) {
        process.stdout.write(JSON.stringify(evt) + '\n');
      } else {
        process.stdout.write(`[${evt.ts}] ${evt.kind} — ${evt.source_role} (${evt.dedupe_key})\n`);
      }
    }
  };

  poll();
  setInterval(poll, interval);
}

/**
 * Main events command handler.
 * @param {object} opts
 */
function eventsCommand(opts = {}) {
  const { subcommand, options } = parseEventsArgs();

  if (!subcommand || subcommand === 'help') {
    process.stdout.write('Usage: devhub events <list|stream|tail> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  list    Fetch events from local bus (T-013c: no HTTP)\n');
    process.stdout.write('  stream  Poll events continuously (local bus)\n');
    process.stdout.write('  tail    Tail JSONL projection for a mission (T-005)\n');
    process.stdout.write('\nOptions:\n');
    process.stdout.write('  --limit <n>       Max events to fetch (default: 50)\n');
    process.stdout.write('  --interval <ms>   Polling interval for stream (default: 1500)\n');
    process.stdout.write('  --mission <id>    Mission id (required for list/stream/tail)\n');
    process.stdout.write('  --json            Output JSON\n');
    process.exit(0);
  }

  switch (subcommand) {
    case 'list':
      return eventsList({ ...opts, ...options });
    case 'stream':
      return eventsStream({ ...opts, ...options });
    case 'tail':
      return eventsTail({ ...opts, ...options });
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      process.stderr.write(`Run 'devhub events help' for usage.\n`);
      process.exit(1);
  }
}

module.exports = eventsCommand;
