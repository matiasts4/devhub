/**
 * Collect a paste-ready evidence bundle after a failed swarm launch.
 *
 * Usage:
 *   node scripts/collect-swarm-launch-evidence.mjs [launchId]
 *   node scripts/collect-swarm-launch-evidence.mjs latest
 *
 * Writes:
 *   data/logs/swarm-evidence/<launchId>-<timestamp>/
 *     summary.md
 *     runtime-diagnostic.txt
 *     events.jsonl
 *     roles/<role>.log
 *     roles/<role>.transcript
 *     roles/<role>.metrics
 */

import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLatestLaunchId, swarmRoleLogPath, swarmRoleLogPathLegacy } from './lib/resolve-swarm-launch-id.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TMP = '/tmp';
const LOG_DIR = join(ROOT, 'data', 'logs');

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return `[error: ${String(error.message || error).trim()}]`;
  }
}

function tailFile(filePath, lines = 120) {
  try {
    if (!existsSync(filePath)) return `[missing: ${filePath}]`;
    const raw = readFileSync(filePath, 'utf8');
    return raw.split('\n').slice(-lines).join('\n');
  } catch (error) {
    return `[unreadable: ${filePath}: ${error.message}]`;
  }
}

function listRoleArtifacts(launchId) {
  const roles = new Set();
  if (!existsSync(TMP)) return roles;

  for (const name of readdirSync(TMP)) {
    const match = name.match(/^devhub-swarm-([^.]+)\.(log|transcript|metrics)$/);
    if (!match) continue;
    roles.add(match[1]);
  }

  for (const name of readdirSync(TMP)) {
    const match = name.match(new RegExp(`^devhub-bootstrap-${launchId}-([^.]+)\\.lock$`));
    if (match) roles.add(match[1]);
  }

  return roles;
}

function copyIfExists(src, dest) {
  if (!existsSync(src)) return false;
  copyFileSync(src, dest);
  return true;
}

function main() {
  let launchId = process.argv[2];
  if (!launchId || launchId === 'latest') {
    launchId = resolveLatestLaunchId({ root: ROOT, tmp: TMP });
  }

  if (!launchId) {
    console.error('error: no launch id provided and none found under /tmp/devhub-bootstrap-*');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(LOG_DIR, 'swarm-evidence', `${launchId}-${timestamp}`);
  const rolesDir = join(outDir, 'roles');
  mkdirSync(rolesDir, { recursive: true });

  const roles = [...listRoleArtifacts(launchId)].sort();
  const copied = [];

  for (const role of roles) {
    for (const ext of ['log', 'transcript', 'metrics']) {
      const scoped = join(TMP, `devhub-swarm-${launchId}-${role}.${ext}`);
      const legacy = join(TMP, `devhub-swarm-${role}.${ext}`);
      const src = existsSync(scoped) ? scoped : legacy;
      const dest = join(rolesDir, `${role}.${ext}`);
      if (copyIfExists(src, dest)) copied.push(dest);
    }
  }

  const missionEvents = join(TMP, `devhub-mission-${launchId}`, 'events.jsonl');
  if (copyIfExists(missionEvents, join(outDir, 'events.jsonl'))) {
    copied.push(join(outDir, 'events.jsonl'));
  }

  const runtimeDiagnostic = safeExec(`node ${join(ROOT, 'scripts', 'diagnose-swarm-runtime.mjs')}`);
  writeFileSync(join(outDir, 'runtime-diagnostic.txt'), `${runtimeDiagnostic}\n`, 'utf8');

  const processSnapshot = safeExec(
    `ps -eo pid,ppid,rss,vsz,comm,args --sort=-rss | rg "devhub|tauri|node|opencode|tmux|swarm" | head -40`
  );
  writeFileSync(join(outDir, 'process-snapshot.txt'), `${processSnapshot}\n`, 'utf8');

  const tmuxState = safeExec('tmux list-sessions 2>&1');
  writeFileSync(join(outDir, 'tmux-sessions.txt'), `${tmuxState}\n`, 'utf8');

  const roleSummaries = roles.map((role) => {
    const logPath = existsSync(swarmRoleLogPath(launchId, role, { tmp: TMP }))
      ? swarmRoleLogPath(launchId, role, { tmp: TMP })
      : swarmRoleLogPathLegacy(role, { tmp: TMP });
    const logTail = tailFile(logPath, 40);
    const exitMatch = logTail.match(/Inner command exited with code:\s*(\d+)/g);
    const maxRestarts = /Max restarts/.test(logTail);
    return [
      `### ${role}`,
      `- log: ${existsSync(logPath) ? logPath : 'missing'}`,
      `- inner_exit_events: ${exitMatch ? exitMatch.length : 0}`,
      `- max_restarts_reached: ${maxRestarts ? 'yes' : 'no'}`,
      '',
      '```',
      logTail,
      '```',
      '',
    ].join('\n');
  });

  const summary = [
    '# Swarm launch evidence bundle',
    '',
    `- launch_id: ${launchId}`,
    `- generated_at: ${new Date().toISOString()}`,
    `- bundle_dir: ${outDir}`,
    '',
    '## Quick checks',
    '',
    `- tmux sessions: see tmux-sessions.txt`,
    `- per-role wrapper logs: roles/*.log`,
    `- per-role transcripts: roles/*.transcript`,
    `- mission events: events.jsonl`,
    `- terminal debug tail: included below`,
    '',
    '## Role summary',
    '',
    ...roleSummaries,
    '## terminal-debug.log (tail)',
    '',
    '```',
    tailFile(join(LOG_DIR, 'terminal-debug.log'), 80),
    '```',
    '',
    '## browser.log (tail)',
    '',
    '```',
    tailFile(join(LOG_DIR, 'browser.log'), 40),
    '```',
    '',
    '## Handoff',
    '',
    'Share this directory or paste summary.md when reporting a failed swarm attempt.',
    'Re-run after each launch attempt to keep an auditable trail.',
    '',
  ].join('\n');

  writeFileSync(join(outDir, 'summary.md'), summary, 'utf8');

  console.log(`Swarm evidence bundle written to:\n  ${outDir}`);
  console.log(`Roles captured: ${roles.length ? roles.join(', ') : '(none)'}`);
  console.log(`Files copied: ${copied.length}`);
  console.log('\nNext: share summary.md with the debugging team.');
}

main();