'use strict';

const http = require('http');
const { getDb } = require('../lib/db');
const { row, section, divider, isTTY } = require('../lib/format');

/**
 * Call the local health API to launch a swarm.
 * @param {string} projectId
 * @param {object} draft
 * @param {object} [options]
 * @returns {Promise<object>}
 */
function callLaunchApi(projectId, draft, options = {}) {
  const baseUrl = options.baseUrl || process.env.DEVHUB_API_URL || 'http://localhost:3000';
  const url = new URL(`${baseUrl}/api/agenthub/operations/health`);
  const body = JSON.stringify({
    action: 'launch_swarm_local',
    project_id: projectId,
    draft,
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            try {
              const parsed = JSON.parse(data);
              reject(new Error(parsed?.error || `HTTP ${res.statusCode}`));
            } catch {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
            return;
          }
          resolve(JSON.parse(data));
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Resolve project ID from name or ID.
 * @param {import('better-sqlite3').Database} db
 * @param {string} input
 * @returns {string|null}
 */
function resolveProjectId(db, input) {
  // Try as ID first
  let project = db.prepare('SELECT * FROM projects WHERE id = ? LIMIT 1').get(input);
  if (project) return project.id;

  // Try as name
  project = db.prepare('SELECT * FROM projects WHERE name = ? LIMIT 1').get(input);
  if (project) return project.id;

  return null;
}

/**
 * `devhub swarm-launch` — launch a swarm from a project.
 * @param {string} projectInput - Project ID or name
 * @param {object} opts
 */
function swarmLaunchCommand(projectInput, opts = {}) {
  const db = getDb();
  const projectId = resolveProjectId(db, projectInput);

  if (!projectId) {
    process.stderr.write(`error: project '${projectInput}' not found.\n`);
    process.exit(1);
  }

  const draft = {};
  if (opts.template) draft.templateId = opts.template;
  if (opts['swarm-type']) draft.swarmTypeId = opts['swarm-type'];
  if (opts.team) draft.teamId = opts.team;
  if (opts.provider) draft.providerId = opts.provider;
  if (opts.mission) draft.mission = opts.mission;
  if (opts['workspace-path']) draft.workspacePath = opts['workspace-path'];

  callLaunchApi(projectId, draft)
    .then((result) => {
      const launch = result.launch_result;
      const tty = isTTY || process.env.FORCE_TTY === '1';

      if (!tty) {
        // Machine-readable output
        process.stdout.write(JSON.stringify(launch, null, 2) + '\n');
        process.exit(0);
        return;
      }

      // Human-readable output
      const lines = [];
      lines.push(section('Swarm Launched'));
      lines.push(row('Launch ID', launch.launchId));
      lines.push(row('Mission', launch.launchLabel));
      lines.push('');
      lines.push(divider());
      lines.push(section('Runtime Requests'));

      for (const req of launch.runtime_requests || []) {
        lines.push(
          row(
            `${req.roleLabel} (${req.roleKey})`,
            `program=${req.selectedAgent} agent=${req.command.match(/--agent\s+(\S+)/)?.[1] || 'default'}`
          )
        );
      }

      lines.push('');
      lines.push('Commands to execute:');
      for (const req of launch.runtime_requests || []) {
        lines.push(`  $ ${req.command}`);
      }
      lines.push('');

      process.stdout.write(lines.join('\n'));
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(1);
    });
}

module.exports = swarmLaunchCommand;
