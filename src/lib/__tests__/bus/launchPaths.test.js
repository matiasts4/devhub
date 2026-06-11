/* eslint-env node, jest */
/**
 * T-011 — Bus helper wiring in the production launch path.
 *
 * Spec: openspec/changes/agent-comms-redesign/verify-report (CRITICAL #2)
 *   - src/app/api/agenthub/operations/health/route.js:238 does NOT pass
 *     busBinaryPath or dbPath to buildAgentLaunchWrapper
 *   - In production, workers see "# Bus helpers skipped" instead of
 *     the actual _devhub_chat / _devhub_event / _devhub_presence /
 *     _devhub_inbox_check definitions
 *   - T-006 shim's call to _devhub_chat would fail at runtime.
 *
 * Fix: extract the bus-path resolution into a pure helper
 * (src/lib/bus/launchPaths.js) so the production caller in health/route.js
 * has a deterministic source for busBinaryPath + dbPath.
 *
 * These tests reference the pure helper (which does not exist yet),
 * guaranteeing a RED result.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('T-011 — bus helper wiring in production launch path', () => {
  test('resolveBusHelperPaths returns busBinaryPath ending in devhub-bus.js and a dbPath', () => {
    const launchPaths = require('../../bus/launchPaths.js');
    const out = launchPaths.resolveBusHelperPaths({
      repoRoot: process.cwd(),
      env: { ...process.env, DEVHUB_DB_PATH: '/tmp/explicit.db' },
    });
    expect(out.busBinaryPath).toMatch(/devhub-bus\.js$/);
    expect(out.dbPath).toBe('/tmp/explicit.db');
  });

  test('resolveBusHelperPaths defaults dbPath to canonical resolveDbPath when env is unset', () => {
    const launchPaths = require('../../bus/launchPaths.js');
    const { resolveDbPath } = require('../../db/pathResolver');
    const env = {};
    delete env.DEVHUB_DB_PATH;
    const out = launchPaths.resolveBusHelperPaths({ repoRoot: '/repo/root', env });
    expect(out.busBinaryPath).toBe('/repo/root/devhub-cli/bin/devhub-bus.js');
    expect(out.dbPath).toBe(resolveDbPath({ env, cwd: '/repo/root' }));
  });

  test('buildLaunchWrapperForRole composes a wrapper that contains _devhub_chat () and _devhub_event ()', () => {
    const launchPaths = require('../../bus/launchPaths.js');
    const wrapper = launchPaths.buildLaunchWrapperForRole({
      agentId: 'launch-abc-coder',
      missionId: 'launch-abc',
      role: 'coder',
      workspacePath: '/tmp/ws',
      repoRoot: process.cwd(),
      dbPath: '/tmp/ws/devhub.db',
      supervisorUrl: 'http://localhost:3100',
      innerCommand: 'sleep 1',
    });
    // CRITICAL: the wrapper must contain the actual function definitions.
    // (We don't anchor with ^/m because buildBusHelpersBlock is composed
    // into a multi-line wrapper string with a comment header above it.)
    expect(wrapper).toMatch(/_devhub_chat\(\) \{/);
    expect(wrapper).toMatch(/_devhub_event\(\) \{/);
    expect(wrapper).toMatch(/_devhub_presence\(\) \{/);
    expect(wrapper).toMatch(/_devhub_inbox_check\(\) \{/);
    // CRITICAL: the wrapper must NOT contain the "skipped" placeholder
    expect(wrapper).not.toMatch(/# Bus helpers skipped/);
  });

  test('buildLaunchWrapperForRole auto-resolves busBinaryPath from repoRoot when omitted (T-011 production fix)', () => {
    const launchPaths = require('../../bus/launchPaths.js');
    const wrapper = launchPaths.buildLaunchWrapperForRole({
      agentId: 'launch-abc-coder',
      missionId: 'launch-abc',
      role: 'coder',
      workspacePath: '/tmp/ws',
      repoRoot: process.cwd(),
      // dbPath and busBinaryPath are intentionally OMITTED. The production
      // caller (buildLaunchCommand in health/route.js) used to omit them,
      // which made the agent shell emit the "# Bus helpers skipped" comment
      // and broke the T-006 _devhub_tell_director shim (which calls
      // _devhub_chat internally). The fix auto-resolves from repoRoot.
      innerCommand: 'sleep 1',
    });
    expect(wrapper).toMatch(/_devhub_chat\(\) \{/);
    expect(wrapper).toMatch(/_devhub_event\(\) \{/);
    expect(wrapper).not.toMatch(/# Bus helpers skipped/);
  });

  test('buildLaunchWrapperForRole wrapper passes bash -n syntax check (helpers block is well-formed)', () => {
    const launchPaths = require('../../bus/launchPaths.js');
    const { spawnSync } = require('child_process');
    const wrapper = launchPaths.buildLaunchWrapperForRole({
      agentId: 'launch-abc-coder',
      missionId: 'launch-abc',
      role: 'coder',
      workspacePath: '/tmp/ws',
      repoRoot: process.cwd(),
      dbPath: '/tmp/ws/devhub.db',
      innerCommand: 'sleep 1',
    });
    const tmp = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-bus-paths-')),
      'wrapper.sh'
    );
    fs.writeFileSync(tmp, wrapper, { mode: 0o644 });
    const r = spawnSync('bash', ['-n', tmp], { encoding: 'utf-8' });
    expect(r.status).toBe(0);
  });
});
