/**
 * Post-launch verification for visible swarm attempts.
 *
 * Usage:
 *   node scripts/verify-swarm-launch.mjs [launchId]
 *   node scripts/verify-swarm-launch.mjs latest
 *   node scripts/verify-swarm-launch.mjs --preflight
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  logHasInnerCommandB64,
  logsMentionLaunch,
  readRoleLog,
  resolveLatestLaunchId,
} from './lib/resolve-swarm-launch-id.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TMP = '/tmp';

const ROLES = ['director', 'coder', 'auditor', 'devops', 'architect'];

function decodeInnerCommandB64(logText) {
  const m = logText.match(/\[AGENT\] Inner command \(b64\): ([A-Za-z0-9+/=]+)/);
  if (!m) return null;
  try {
    return Buffer.from(m[1], 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function check(name, ok, detail) {
  return { name, ok, detail };
}

function runPreflight() {
  const results = [];

  const jest = spawnSync(
    'npx',
    [
      'jest',
      'tests/unit/swarm-launch-command.test.js',
      'tests/unit/swarm-route-launch-command.test.js',
      '--runInBand',
      '--colors=false',
      '--silent',
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  results.push(
    check(
      'unit:swarm-launch-command',
      jest.status === 0,
      jest.status === 0 ? 'passed' : (jest.stderr || jest.stdout || '').slice(-400)
    )
  );

  const simulate = spawnSync('node', [join(ROOT, 'scripts/simulate-swarm-inner-command.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
  });
  results.push(
    check(
      'simulate:opencode-in-tmux',
      simulate.status === 0,
      simulate.status === 0
        ? (simulate.stdout || '').trim().split('\n').slice(-3).join(' | ')
        : (simulate.stderr || simulate.stdout || '').slice(-500)
    )
  );

  return results;
}

function verifyLaunch(launchId) {
  const results = [];
  let opencodeRunning = false;

  try {
    execSync('pgrep -af "[o]pencode.*--agent"', { encoding: 'utf8' });
    opencodeRunning = true;
  } catch {
    opencodeRunning = false;
  }

  const logsFresh = logsMentionLaunch(launchId, { tmp: TMP, roles: ROLES });
  const directorHasB64 = logHasInnerCommandB64('director', launchId, { tmp: TMP });

  results.push(
    check(
      'logs:fresh-for-launch',
      logsFresh,
      logsFresh
        ? `role logs mention ${launchId}`
        : `role logs are stale or from another launch — launch swarm again, then re-run verify`
    )
  );

  results.push(
    check(
      'logs:inner-b64-marker',
      directorHasB64 || !logsFresh,
      directorHasB64
        ? 'wrapper logs Inner command (b64) — dev server has current wrapper'
        : logsFresh
          ? 'restart dev server so wrapper logs Inner command (b64)'
          : 'skipped until fresh launch logs exist'
    )
  );

  if (!logsFresh) {
    results.push(
      check(
        'runtime:opencode-process',
        opencodeRunning,
        opencodeRunning
          ? 'at least one opencode --agent process is running (logs stale — launch again to verify end-to-end)'
          : 'no opencode --agent process found'
      )
    );
    return results;
  }

  results.push(
    check(
      'runtime:opencode-process',
      opencodeRunning,
      opencodeRunning ? 'at least one opencode --agent process is running' : 'no opencode --agent process found'
    )
  );

  for (const role of ROLES) {
    const { path: logPath, text: log } = readRoleLog(launchId, role, { tmp: TMP });
    if (!log) {
      results.push(check(`log:${role}`, false, `missing ${logPath}`));
      continue;
    }
    const launchScoped = log.includes(launchId);
    if (!launchScoped) {
      results.push(check(`log:${role}:scope`, false, `log does not mention ${launchId}`));
      continue;
    }

    const innerExit = (log.match(/Inner command exited with code: 1/g) || []).length;
    const maxRestarts = /Max restarts/.test(log);
    const pastedWithoutOpencode = /OpenCode not running/.test(log);
    const bootstrapComplete = /Prompt injection complete/.test(log);
    const innerCmd = decodeInnerCommandB64(log);

    results.push(
      check(
        `log:${role}:no-immediate-exit1`,
        innerExit === 0,
        innerExit ? `${innerExit} inner exit 1 events` : 'no inner exit 1'
      )
    );
    results.push(
      check(`log:${role}:no-max-restarts`, !maxRestarts, maxRestarts ? 'max restarts reached' : 'ok')
    );

    if (innerCmd) {
      results.push(
        check(
          `log:${role}:inner-no-tmux-wrap`,
          !innerCmd.includes('tmux attach-session'),
          innerCmd.slice(0, 120)
        )
      );
      results.push(
        check(
          `log:${role}:inner-has-pure`,
          innerCmd.includes('--pure'),
          innerCmd.includes('--pure') ? 'has --pure' : innerCmd.slice(0, 120)
        )
      );
    }

    if (pastedWithoutOpencode) {
      results.push(
        check(
          `log:${role}:bootstrap-gated`,
          true,
          'bootstrap correctly skipped paste (OpenCode not running)'
        )
      );
    } else if (bootstrapComplete && opencodeRunning) {
      results.push(check(`log:${role}:bootstrap-injected`, true, 'bootstrap injected after OpenCode up'));
    }
  }

  const tmux = (() => {
    try {
      return execSync('tmux list-sessions 2>/dev/null', { encoding: 'utf8' });
    } catch {
      return '';
    }
  })();
  const escapedLaunchId = launchId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const swarmSessions = (tmux.match(new RegExp(`devhub-swarm-${escapedLaunchId}`, 'g')) || []).length;
  const devhubPanels = (tmux.match(/devhub-p\d+/g) || []).length;

  results.push(
    check(
      'tmux:swarm-or-panel-sessions',
      swarmSessions > 0 || devhubPanels >= ROLES.length,
      swarmSessions
        ? `${swarmSessions} devhub-swarm-${launchId} session refs`
        : devhubPanels
          ? `${devhubPanels} devhub panel sessions (swarm may use panel tmux names)`
          : tmux.trim() || 'no tmux server'
    )
  );

  return results;
}

function printReport(title, results) {
  console.log(`\n=== ${title} ===\n`);
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    if (!r.ok) failed += 1;
    console.log(`${mark}  ${r.name}`);
    if (r.detail) console.log(`      ${r.detail}`);
  }
  console.log(`\n${failed ? 'FAILED' : 'PASSED'} — ${results.length - failed}/${results.length} checks ok\n`);
  return failed === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
if (args.includes('--preflight')) {
  process.exit(printReport('Swarm preflight', runPreflight()));
}

let launchId = args[0] || 'latest';
if (launchId === 'latest') {
  launchId = resolveLatestLaunchId({ root: ROOT, tmp: TMP });
  if (!launchId) {
    console.error('error: no launch id found. Run a swarm first or pass an explicit launchId.');
    process.exit(1);
  }
}

const preflight = runPreflight();
const launchChecks = verifyLaunch(launchId);
const code = printReport(`Swarm verify — ${launchId}`, [...preflight, ...launchChecks]);
process.exit(code);