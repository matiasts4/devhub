/* eslint-env node, jest */
/**
 * T-004 — bootstrap injection lock state machine tests.
 *
 * Spec: openspec/changes/agent-comms-redesign/specs/bootstrap-injection-lock/spec.md
 *   - LOCK-S1: new path /tmp/devhub-injection-<launch>-<role>.lock with JSON state
 *   - LOCK-S2: old path /tmp/devhub-bootstrap-... read with WARN (compat for 1 release)
 *   - LOCK-S3: pending → injecting → injected (happy path)
 *   - LOCK-S4: injected → failed on downstream error
 *   - LOCK-S5: skipping state (pending → injected) is REJECTED
 *   - LOCK-S6: stale lock recovery (dead pid)
 *   - LOCK-S7: stale lock recovery (>1h stuck)
 *   - LOCK-S8: in-flight launch with old-format lock is migrated, not failed
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const wrapper = require('../agentLaunchWrapper.js');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-lock-'));
}

function lockPath(tmp, launch, role) {
  return path.join(tmp, `devhub-injection-${launch}-${role}.lock`);
}

function readLock(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

describe('T-004 — injection lock', () => {
  test('LOCK-S1: createInjectionLock writes JSON state to /tmp/devhub-injection-<launch>-<role>.lock', () => {
    const tmp = makeTmp();
    const file = lockPath(tmp, 'launch-abc', 'coder');
    wrapper.createInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      missionId: 'm1',
    });
    expect(fs.existsSync(file)).toBe(true);
    const data = readLock(file);
    expect(data.state).toBe('pending');
    expect(data.launch_id).toBe('launch-abc');
    expect(data.role).toBe('coder');
    expect(data.mission_id).toBe('m1');
    expect(data.pid).toBeGreaterThan(0);
    expect(data.created_at).toBeTruthy();
    expect(data.updated_at).toBeTruthy();
  });

  test('LOCK-S3: happy path — pending → injecting → injected transitions advance state', () => {
    const tmp = makeTmp();
    const file = lockPath(tmp, 'launch-abc', 'coder');
    wrapper.createInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      missionId: 'm1',
    });
    expect(readLock(file).state).toBe('pending');

    const r1 = wrapper.advanceInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      from: 'pending',
      to: 'injecting',
    });
    expect(r1.ok).toBe(true);
    expect(readLock(file).state).toBe('injecting');

    const r2 = wrapper.advanceInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      from: 'injecting',
      to: 'injected',
    });
    expect(r2.ok).toBe(true);
    expect(readLock(file).state).toBe('injected');
  });

  test('LOCK-S4: injected → failed is allowed on downstream error', () => {
    const tmp = makeTmp();
    const file = lockPath(tmp, 'launch-abc', 'coder');
    wrapper.createInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      missionId: 'm1',
    });
    wrapper.advanceInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      from: 'pending',
      to: 'injecting',
    });
    wrapper.advanceInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      from: 'injecting',
      to: 'injected',
    });

    const r = wrapper.advanceInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      from: 'injected',
      to: 'failed',
      reason: 'tmux-paste-failed',
    });
    expect(r.ok).toBe(true);
    expect(readLock(file).state).toBe('failed');
    expect(readLock(file).failure_reason).toBe('tmux-paste-failed');
  });

  test('LOCK-S5: skipping state (pending → injected) is REJECTED', () => {
    const tmp = makeTmp();
    const file = lockPath(tmp, 'launch-abc', 'coder');
    wrapper.createInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      missionId: 'm1',
    });

    const r = wrapper.advanceInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      from: 'pending',
      to: 'injected',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/invalid transition/i);
    expect(readLock(file).state).toBe('pending');
  });

  test('LOCK-S6: stale lock with dead pid is recovered on next createInjectionLock', () => {
    const tmp = makeTmp();
    const file = lockPath(tmp, 'launch-abc', 'coder');
    fs.writeFileSync(
      file,
      JSON.stringify({
        launch_id: 'launch-abc',
        role: 'coder',
        mission_id: 'm1',
        state: 'pending',
        pid: 999999,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    );
    // Pretend 999999 is dead — we'll use a pid we know doesn't exist (high number)
    wrapper.createInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      missionId: 'm1',
    });
    const data = readLock(file);
    expect(data.state).toBe('pending');
    expect(data.pid).toBeGreaterThan(0);
    expect(data.pid).not.toBe(999999);
  });

  test('LOCK-S7: lock older than 1h in non-terminal state is recovered', () => {
    const tmp = makeTmp();
    const file = lockPath(tmp, 'launch-abc', 'coder');
    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(
      file,
      JSON.stringify({
        launch_id: 'launch-abc',
        role: 'coder',
        mission_id: 'm1',
        state: 'injecting',
        pid: process.pid,
        created_at: longAgo,
        updated_at: longAgo,
      })
    );
    wrapper.createInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      missionId: 'm1',
    });
    const data = readLock(file);
    // Recovered: state is pending again, pid is current, updated_at is recent
    expect(data.state).toBe('pending');
    expect(new Date(data.updated_at).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  test('LOCK-S8: old-format lock at /tmp/devhub-bootstrap-<mission>-<role>.lock is detected with WARN', () => {
    const tmp = makeTmp();
    // Place an old-format lock (a PID file)
    const oldFile = path.join(tmp, 'devhub-bootstrap-launch-abc-coder.lock');
    fs.writeFileSync(oldFile, '12345');

    const result = wrapper.detectLegacyBootstrapLock({
      lockDir: tmp,
      missionId: 'launch-abc',
      role: 'coder',
    });
    expect(result.found).toBe(true);
    expect(result.path).toBe(oldFile);
  });

  test('LOCK-S2: readLegacyBootstrapLock with WARN returns the PID but flags as deprecated', () => {
    const tmp = makeTmp();
    const oldFile = path.join(tmp, 'devhub-bootstrap-launch-abc-coder.lock');
    fs.writeFileSync(oldFile, '12345');
    const result = wrapper.readLegacyBootstrapLock({
      lockDir: tmp,
      missionId: 'launch-abc',
      role: 'coder',
    });
    expect(result.found).toBe(true);
    expect(result.pid).toBe('12345');
    expect(result.deprecated).toBe(true);
  });

  test('atomic rename: state transition uses temp file + rename (no partial writes)', () => {
    const tmp = makeTmp();
    wrapper.createInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      missionId: 'm1',
    });
    // During transition, no .tmp file should be left behind
    wrapper.advanceInjectionLock({
      lockDir: tmp,
      launchId: 'launch-abc',
      role: 'coder',
      from: 'pending',
      to: 'injecting',
    });
    const tmpFiles = fs.readdirSync(tmp).filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);
  });
});
