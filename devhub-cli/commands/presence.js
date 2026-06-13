'use strict';

/**
 * `devhub presence` — agent presence listing.
 *
 * T-013b: previously routed to a retired HTTP endpoint
 * (`/api/agenthub/presence/heartbeat` → 404). Now calls the devhub-bus
 * binary directly (no HTTP): `presence-list --mission <id> [--role <r>]`.
 *
 * For ergonomics we also accept the legacy `--agent` flag as a synonym
 * for `--role` (the heartbeat binary uses `agent_id` internally).
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BUS_BIN = path.resolve(__dirname, '../bin/devhub-bus.js');

function parsePresenceArgs() {
  const args = process.argv.slice(3);
  const subcommand = 'list'; // only one subcommand supported
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--mission' && args[i + 1]) {
      options.missionId = args[i + 1];
      i++;
    } else if ((a === '--role' || a === '--agent') && args[i + 1]) {
      options.role = args[i + 1];
      i++;
    } else if (a === '--json') {
      options.json = true;
    }
  }

  return { subcommand, options };
}

function resolveDbPath() {
  return process.env.DEVHUB_DB_PATH || null;
}

function presenceList(opts = {}) {
  if (!opts.missionId) {
    process.stderr.write('error: presence list requires --mission.\n');
    process.exit(64);
  }
  const dbPath = resolveDbPath();
  if (!dbPath) {
    process.stderr.write('error: presence list requires DEVHUB_DB_PATH or --db flag.\n');
    process.exit(64);
  }
  if (!fs.existsSync(BUS_BIN)) {
    process.stderr.write(`error: devhub-bus binary not found at ${BUS_BIN}\n`);
    process.exit(73);
  }
  const args = [BUS_BIN, '--db', dbPath, 'presence-list', '--mission', opts.missionId];
  if (opts.role) args.push('--role', opts.role);

  const r = spawnSync('node', args, { encoding: 'utf-8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || `presence-list exited ${r.status}\n`);
    process.exit(r.status || 1);
  }

  let rows;
  try {
    rows = JSON.parse(r.stdout.trim() || '[]');
  } catch (e) {
    process.stderr.write(`error: failed to parse presence-list output: ${e.message}\n`);
    process.exit(1);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ count: rows.length, presence: rows }) + '\n');
  } else if (rows.length === 0) {
    process.stdout.write('No active agents.\n');
  } else {
    const headers = ['Role', 'State', 'Mission', 'Status', 'Last Seen'];
    const tableRows = rows.map((p) => [
      p.agent_id || '',
      p.presence_state || '',
      p.mission_id || '(none)',
      (p.status_summary || '').slice(0, 30),
      p.last_seen_at || '',
    ]);
    process.stdout.write(`\nPRESENCE (${rows.length})\n\n`);
    process.stdout.write(formatTable(headers, tableRows));
    process.stdout.write('\n');
  }
  process.exit(0);
}

/**
 * Lightweight aligned table renderer (no external deps). The cli/lib/format.js
 * `table` returns non-TTY output that is pipe-delimited; we want a slightly
 * nicer layout for the human case here.
 */
function formatTable(headers, rows) {
  const widths = headers.map((h, i) => {
    let w = String(h).length;
    for (const row of rows) {
      const v = String(row[i] || '');
      if (v.length > w) w = v.length;
    }
    return w;
  });
  const pad = (s, w) => String(s || '').padEnd(w);
  const lines = [];
  lines.push(headers.map((h, i) => pad(h, widths[i])).join('  '));
  lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    lines.push(row.map((c, i) => pad(c, widths[i])).join('  '));
  }
  return lines.join('\n');
}

function presenceCommand(opts = {}) {
  const { subcommand, options } = parsePresenceArgs();

  if (subcommand === 'help') {
    process.stdout.write('Usage: devhub presence [list] [options]\n');
    process.stdout.write('\nOptions:\n');
    process.stdout.write('  --mission <id>  Filter by mission ID (required)\n');
    process.stdout.write('  --role <id>     Filter by role / agent_id\n');
    process.stdout.write('  --agent <id>    Synonym for --role\n');
    process.stdout.write('  --json          Output JSON\n');
    process.exit(0);
  }

  return presenceList({ ...opts, ...options });
}

module.exports = presenceCommand;
