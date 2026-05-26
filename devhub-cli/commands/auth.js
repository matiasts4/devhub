'use strict';

/**
 * `devhub auth` — authentication management for CLI.
 * Subcommands: login, status, verify
 */

const { generateAgentSecret, hashToken, readAuthFile, writeAuthFile } = require('../lib/auth');
const { request } = require('../lib/httpClient');
const { getDb } = require('../lib/db');

/**
 * Parse args for auth subcommands.
 * @returns {object} { subcommand, options }
 */
function parseAuthArgs() {
  const args = process.argv.slice(3); // ['node', 'bin/devhub', 'auth', ...]
  const subcommand = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--json') {
      options.json = true;
    } else if (args[i] === '--agent-id' && args[i + 1]) {
      options.agentId = args[i + 1];
      i++;
    } else if (args[i] === '--workspace-id' && args[i + 1]) {
      options.workspaceId = args[i + 1];
      i++;
    }
  }

  return { subcommand, options };
}

/**
 * `devhub auth login` — generate and store agent secret.
 * @param {object} opts
 */
async function authLogin(opts = {}) {
  const agentId = opts.agentId || `cli-agent-${Date.now()}`;
  const workspaceId = opts.workspaceId || null;
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);
  const createdAt = new Date().toISOString();

  // Optionally provision in DB if available
  try {
    const db = getDb();
    // Import provisionAuthToken from localDb if available
    const localDb = require('../../src/lib/db/localDb.js');
    if (localDb.provisionAuthToken) {
      localDb.provisionAuthToken(db, {
        agentId,
        workspaceId,
        tokenHash,
        rawSecret: secret,
        algorithm: 'hmac-sha256',
      });
    }
  } catch (err) {
    // DB provisioning is optional — continue without it
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ warning: `DB provisioning skipped: ${err.message}` }) + '\n'
      );
    } else {
      process.stderr.write(`Warning: DB provisioning skipped: ${err.message}\n`);
    }
  }

  // Write auth file
  writeAuthFile({
    agent_id: agentId,
    secret,
    workspace_id: workspaceId,
    created_at: createdAt,
  });

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({
        success: true,
        agent_id: agentId,
        workspace_id: workspaceId,
        created_at: createdAt,
        secret_hash: tokenHash.slice(0, 16),
      }) + '\n'
    );
  } else {
    process.stdout.write(`✓ Authenticated as ${agentId}\n`);
    process.stdout.write(`  Secret stored in ~/.devhub/auth.json\n`);
    process.stdout.write(`  Secret hash: ${tokenHash.slice(0, 16)}...\n`);
  }
  process.exit(0);
}

/**
 * `devhub auth status` — show current auth state.
 * @param {object} opts
 */
function authStatus(opts = {}) {
  const auth = readAuthFile();
  if (!auth) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ authenticated: false }) + '\n');
    } else {
      process.stdout.write('Not authenticated. Run `devhub auth login`.\n');
    }
    process.exit(1);
  }

  const secretHash = hashToken(auth.secret);
  if (opts.json) {
    process.stdout.write(
      JSON.stringify({
        authenticated: true,
        agent_id: auth.agent_id,
        workspace_id: auth.workspace_id || null,
        created_at: auth.created_at,
        secret_hash: secretHash.slice(0, 16),
      }) + '\n'
    );
  } else {
    process.stdout.write('Authenticated\n');
    process.stdout.write(`  Agent ID: ${auth.agent_id}\n`);
    process.stdout.write(`  Workspace ID: ${auth.workspace_id || '(none)'}\n`);
    process.stdout.write(`  Created: ${auth.created_at}\n`);
    process.stdout.write(`  Secret hash: ${secretHash.slice(0, 16)}...\n`);
  }
  process.exit(0);
}

/**
 * `devhub auth verify` — verify credentials against API.
 * @param {object} opts
 */
async function authVerify(opts = {}) {
  const auth = readAuthFile();
  if (!auth) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ valid: false, reason: 'not_authenticated' }) + '\n');
    } else {
      process.stdout.write('Not authenticated. Run `devhub auth login`.\n');
    }
    process.exit(1);
  }

  const baseUrl = process.env.DEVHUB_API_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/agenthub/presence/heartbeat`;

  try {
    const result = await request({
      url,
      method: 'POST',
      body: {
        agent_id: auth.agent_id,
        state: 'idle',
        mission_id: null,
        status_summary: 'CLI auth verification',
      },
      signed: true,
    });

    if (result.status === 200) {
      if (opts.json) {
        process.stdout.write(JSON.stringify({ valid: true }) + '\n');
      } else {
        process.stdout.write('✓ Credentials valid\n');
      }
      process.exit(0);
    } else {
      if (opts.json) {
        process.stdout.write(
          JSON.stringify({ valid: false, reason: result.error || 'auth_failed' }) + '\n'
        );
      } else {
        process.stdout.write(`✗ Verification failed: ${result.error}\n`);
      }
      process.exit(1);
    }
  } catch (err) {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ valid: false, reason: 'connection_failed', error: err.message }) + '\n'
      );
    } else {
      process.stdout.write(`✗ Connection failed: ${err.message}\n`);
      process.stdout.write(`  Make sure DevHub API is running at ${baseUrl}\n`);
    }
    process.exit(1);
  }
}

/**
 * Main auth command handler.
 * @param {object} opts
 */
async function authCommand(opts = {}) {
  const { subcommand, options } = parseAuthArgs();

  if (!subcommand || subcommand === 'help') {
    process.stdout.write('Usage: devhub auth <login|status|verify> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  login   Generate and store agent secret\n');
    process.stdout.write('  status  Show current auth state\n');
    process.stdout.write('  verify  Verify credentials against API\n');
    process.stdout.write('\nOptions:\n');
    process.stdout.write('  --agent-id <id>      Agent ID (login only)\n');
    process.stdout.write('  --workspace-id <id>  Workspace ID (login only)\n');
    process.stdout.write('  --json               Output JSON\n');
    process.exit(0);
  }

  switch (subcommand) {
    case 'login':
      return authLogin({ ...opts, ...options });
    case 'status':
      return authStatus({ ...opts, ...options });
    case 'verify':
      return authVerify({ ...opts, ...options });
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      process.stderr.write(`Run 'devhub auth help' for usage.\n`);
      process.exit(1);
  }
}

module.exports = authCommand;
