'use strict';

/**
 * `devhub events` — agent events stream and query.
 * Subcommands: list, stream
 */

const { request } = require('../lib/httpClient');
const { readAuthFile } = require('../lib/auth');

/**
 * Parse args for events subcommands.
 * @returns {object} { subcommand, options }
 */
function parseEventsArgs() {
  const args = process.argv.slice(3); // ['node', 'bin/devhub', 'events', ...]
  const subcommand = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
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
    } else if (args[i] === '--json') {
      options.json = true;
    }
  }

  return { subcommand, options };
}

/**
 * `devhub events list` — fetch events from API.
 * @param {object} opts
 */
async function eventsList(opts = {}) {
  const baseUrl = process.env.DEVHUB_API_URL || 'http://localhost:3000';
  const params = new URLSearchParams();

  if (opts.agentId) params.append('agent_id', opts.agentId);
  if (opts.eventType) params.append('event_type', opts.eventType);
  if (opts.since) params.append('since', opts.since);
  if (opts.limit) params.append('limit', opts.limit.toString());

  const url = `${baseUrl}/api/agenthub/events?${params.toString()}`;
  const auth = readAuthFile();
  const signed = !!auth; // Sign if authenticated

  try {
    const result = await request({ url, signed });

    if (result.status === 200) {
      if (opts.json) {
        process.stdout.write(JSON.stringify(result.data) + '\n');
      } else {
        const events = result.data.events || [];
        if (events.length === 0) {
          process.stdout.write('No events found.\n');
        } else {
          process.stdout.write(`\n=== Events (${events.length}) ===\n\n`);
          for (const evt of events) {
            process.stdout.write(
              `[${evt.created_at}] ${evt.event_type || 'unknown'} — ${evt.agent_id || '(no agent)'}\n`
            );
            if (evt.payload) {
              process.stdout.write(`  ${JSON.stringify(evt.payload)}\n`);
            }
          }
        }
      }
      process.exit(0);
    } else {
      process.stderr.write(`Error: ${result.error}\n`);
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(`Connection failed: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * `devhub events stream` — poll events with cursor.
 * @param {object} opts
 */
async function eventsStream(opts = {}) {
  const baseUrl = process.env.DEVHUB_API_URL || 'http://localhost:3000';
  const interval = opts.interval || 1500; // ms
  let cursor = opts.since || new Date().toISOString();

  process.stdout.write(`Streaming events (polling every ${interval}ms)...\n`);
  process.stdout.write('Press Ctrl+C to stop.\n\n');

  const poll = async () => {
    const params = new URLSearchParams();
    if (opts.agentId) params.append('agent_id', opts.agentId);
    if (opts.eventType) params.append('event_type', opts.eventType);
    params.append('since', cursor);
    params.append('limit', '50');

    const url = `${baseUrl}/api/agenthub/events?${params.toString()}`;
    const auth = readAuthFile();
    const signed = !!auth;

    try {
      const result = await request({ url, signed });
      if (result.status === 200) {
        const events = result.data.events || [];
        for (const evt of events) {
          if (opts.json) {
            process.stdout.write(JSON.stringify(evt) + '\n');
          } else {
            process.stdout.write(
              `[${evt.created_at}] ${evt.event_type || 'unknown'} — ${evt.agent_id || '(no agent)'}\n`
            );
          }
          // Update cursor to latest event timestamp
          if (evt.created_at && evt.created_at > cursor) {
            cursor = evt.created_at;
          }
        }
      }
    } catch (err) {
      process.stderr.write(`Poll error: ${err.message}\n`);
    }
  };

  // Initial poll
  await poll();

  // Interval polling
  setInterval(poll, interval);
}

/**
 * Main events command handler.
 * @param {object} opts
 */
async function eventsCommand(opts = {}) {
  const { subcommand, options } = parseEventsArgs();

  if (!subcommand || subcommand === 'help') {
    process.stdout.write('Usage: devhub events <list|stream> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  list    Fetch events from API\n');
    process.stdout.write('  stream  Poll events continuously\n');
    process.stdout.write('\nOptions:\n');
    process.stdout.write('  --agent <id>      Filter by agent ID\n');
    process.stdout.write('  --type <type>     Filter by event type\n');
    process.stdout.write('  --since <iso>     Fetch events after timestamp\n');
    process.stdout.write('  --limit <n>       Max events to fetch (default: 50)\n');
    process.stdout.write('  --interval <ms>   Polling interval for stream (default: 1500)\n');
    process.stdout.write('  --json            Output JSON\n');
    process.exit(0);
  }

  switch (subcommand) {
    case 'list':
      return eventsList({ ...opts, ...options });
    case 'stream':
      return eventsStream({ ...opts, ...options });
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      process.stderr.write(`Run 'devhub events help' for usage.\n`);
      process.exit(1);
  }
}

module.exports = eventsCommand;
