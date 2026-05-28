'use strict';

/**
 * `devhub presence` — agent presence listing.
 */

const { request } = require('../lib/httpClient');
const { readAuthFile } = require('../lib/auth');
const { table, section } = require('../lib/format');

/**
 * Parse args for presence.
 */
function parsePresenceArgs() {
  const args = process.argv.slice(3);
  let subcommand = args[0] === 'list' ? 'list' : 'list'; // Default to list
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mission' && args[i + 1]) {
      options.missionId = args[i + 1];
      i++;
    } else if (args[i] === '--agent' && args[i + 1]) {
      options.agentId = args[i + 1];
      i++;
    } else if (args[i] === '--json') {
      options.json = true;
    }
  }

  return { subcommand, options };
}

/**
 * `devhub presence list` — list agent presence.
 */
async function presenceList(opts = {}) {
  const baseUrl = process.env.DEVHUB_API_URL || 'http://localhost:3000';
  const params = new URLSearchParams();

  if (opts.missionId) params.append('mission_id', opts.missionId);
  if (opts.agentId) params.append('agent_id', opts.agentId);

  const url = `${baseUrl}/api/agenthub/presence/heartbeat?${params.toString()}`;
  const auth = readAuthFile();
  const signed = !!auth;

  try {
    const result = await request({ url, signed });

    if (result.status === 200) {
      const presence = result.data.presence || [];

      if (opts.json) {
        process.stdout.write(JSON.stringify(result.data) + '\n');
      } else {
        if (presence.length === 0) {
          process.stdout.write('No active agents.\n');
        } else {
          process.stdout.write(section(`PRESENCE (${presence.length})`));
          process.stdout.write('\n');
          const headers = ['Agent', 'State', 'Mission', 'Last Seen'];
          const rows = presence.map((p) => [
            p.agent_id || '',
            p.presence_state || '',
            p.mission_id || '(none)',
            p.last_seen_at || '',
          ]);
          process.stdout.write(table(headers, rows));
          process.stdout.write('\n');
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
 * Main presence command handler.
 */
async function presenceCommand(opts = {}) {
  const { subcommand, options } = parsePresenceArgs();

  if (subcommand === 'help') {
    process.stdout.write('Usage: devhub presence [list] [options]\n');
    process.stdout.write('\nOptions:\n');
    process.stdout.write('  --mission <id>  Filter by mission ID\n');
    process.stdout.write('  --agent <id>    Filter by agent ID\n');
    process.stdout.write('  --json          Output JSON\n');
    process.exit(0);
  }

  return presenceList({ ...opts, ...options });
}

module.exports = presenceCommand;
