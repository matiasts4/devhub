/**
 * startupRestoreCoordinator.policyGating.test.js
 *
 * Phase 4 TDD: Policy gating in buildStartupRestorePlan
 *
 * RED: Tests below are written expecting the gating behavior to exist.
 * GREEN: After implementation, all tests pass.
 *
 * Scope:
 * - 'auto' sessions are included in the restore plan
 * - 'manual' sessions are excluded from automatic restore (emit TERMINATED action)
 * - 'off' sessions are skipped entirely (no action emitted)
 * - Invalid/missing defaults to 'auto' and is included
 * - Mixed policies in the same workspace
 */

const { JSDOM } = require('jsdom');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeManifest({ terminalSessions = [] } = {}) {
  return {
    terminalSessions,
    swarmRuns: [],
  };
}

function makeRuntimeSnapshot({ terminals = [], processes = [] } = {}) {
  return { terminals, processes, anomalies: {} };
}

function makeMinimalRuntime() {
  return makeRuntimeSnapshot({});
}

// ---------------------------------------------------------------------------
// Helper: import fresh module
// ---------------------------------------------------------------------------

let buildStartupRestorePlan;
let RESTORE_ACTION;
let normalizeRestoreManifest;

function loadModule() {
  jest.resetModules();
  const mod = require('../../../lib/terminal/startupRestoreCoordinator');
  buildStartupRestorePlan = mod.buildStartupRestorePlan;
  RESTORE_ACTION = mod.RESTORE_ACTION;
  normalizeRestoreManifest = mod.normalizeRestoreManifest;
}

// ---------------------------------------------------------------------------
// Shared describe
// ---------------------------------------------------------------------------

describe('startupRestoreCoordinator — policy gating', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://devhub.test',
    });
    global.window = dom.window;
    global.localStorage = dom.window.localStorage;
    loadModule();
  });

  afterEach(() => {
    if (global.window) {
      global.window.close();
    }
    delete global.window;
    delete global.localStorage;
  });

  // -------------------------------------------------------------------------
  // SESS-S11: 'auto' session is included in plan
  // -------------------------------------------------------------------------
  describe("'auto' policy — included in restore plan", () => {
    it('emits RESUME_OPENCODE_SESSION for opencode-durable session with auto policy', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-session-1',
            cwd: null,
            restorePolicy: 'auto',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].action).toBe(RESTORE_ACTION.RESUME_OPENCODE_SESSION);
      expect(plan.actions[0].opencodeSessionId).toBe('oc-session-1');
    });

    it('emits RESTORE_SHELL_EMERGENT for shell-ephemeral session with auto policy', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't2',
            panelId: 'p2',
            workspaceId: 'ws1',
            opencodeSessionId: null,
            cwd: '/home/user',
            restorePolicy: 'auto',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].action).toBe(RESTORE_ACTION.RESTORE_SHELL_EMERGENT);
      expect(plan.actions[0].terminalId).toBe('t2');
    });

    it('includes multiple auto sessions as separate actions', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-1',
            cwd: null,
            restorePolicy: 'auto',
          },
          {
            terminalId: 't2',
            panelId: 'p2',
            workspaceId: 'ws1',
            opencodeSessionId: null,
            cwd: '/tmp',
            restorePolicy: 'auto',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(2);
      const actions = plan.actions.map((a) => a.action);
      expect(actions).toContain(RESTORE_ACTION.RESUME_OPENCODE_SESSION);
      expect(actions).toContain(RESTORE_ACTION.RESTORE_SHELL_EMERGENT);
    });
  });

  // -------------------------------------------------------------------------
  // SESS-S12: 'manual' session is excluded from automatic restore
  // -------------------------------------------------------------------------
  describe("'manual' policy — excluded from automatic restore", () => {
    it('emits TERMINATED for opencode-durable session with manual policy', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-session-1',
            cwd: null,
            restorePolicy: 'manual',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].action).toBe(RESTORE_ACTION.TERMINATED);
      expect(plan.actions[0].opencodeSessionId).toBe('oc-session-1');
      expect(plan.actions[0].reason).toBe('restore-policy-manual');
    });

    it('emits TERMINATED for shell-ephemeral session with manual policy', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't2',
            panelId: 'p2',
            workspaceId: 'ws1',
            opencodeSessionId: null,
            cwd: '/home/user',
            restorePolicy: 'manual',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].action).toBe(RESTORE_ACTION.TERMINATED);
      expect(plan.actions[0].terminalId).toBe('t2');
    });

    it('manual opencode session does NOT appear as RESUME_OPENCODE_SESSION', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-session-1',
            cwd: null,
            restorePolicy: 'manual',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      const resumeActions = plan.actions.filter(
        (a) => a.action === RESTORE_ACTION.RESUME_OPENCODE_SESSION
      );
      expect(resumeActions).toHaveLength(0);
    });

    it('manual shell-ephemeral does NOT appear as RESTORE_SHELL_EMERGENT', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't2',
            panelId: 'p2',
            workspaceId: 'ws1',
            opencodeSessionId: null,
            cwd: '/home/user',
            restorePolicy: 'manual',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      const shellActions = plan.actions.filter(
        (a) => a.action === RESTORE_ACTION.RESTORE_SHELL_EMERGENT
      );
      expect(shellActions).toHaveLength(0);
    });

    it('multiple manual sessions all emit TERMINATED', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-1',
            cwd: null,
            restorePolicy: 'manual',
          },
          {
            terminalId: 't2',
            panelId: 'p2',
            workspaceId: 'ws1',
            opencodeSessionId: null,
            cwd: '/tmp',
            restorePolicy: 'manual',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(2);
      expect(plan.actions.every((a) => a.action === RESTORE_ACTION.TERMINATED)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // SESS-S13: 'off' session is skipped entirely — no action emitted
  // -------------------------------------------------------------------------
  describe("'off' policy — skipped entirely, no action emitted", () => {
    it('opencode session with off policy emits no action', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-session-1',
            cwd: null,
            restorePolicy: 'off',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(0);
    });

    it('shell-ephemeral session with off policy emits no action', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't2',
            panelId: 'p2',
            workspaceId: 'ws1',
            opencodeSessionId: null,
            cwd: '/home/user',
            restorePolicy: 'off',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(0);
    });

    it('off session does not appear even as TERMINATED', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-session-1',
            cwd: null,
            restorePolicy: 'off',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      const terminatedActions = plan.actions.filter((a) => a.action === RESTORE_ACTION.TERMINATED);
      expect(terminatedActions).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid/missing defaults to 'auto' — included in plan
  // -------------------------------------------------------------------------
  describe('invalid/missing restorePolicy defaults to "auto" and is included', () => {
    it('missing restorePolicy (undefined) is treated as auto and included', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-session-1',
            cwd: null,
            // restorePolicy intentionally absent
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].action).toBe(RESTORE_ACTION.RESUME_OPENCODE_SESSION);
    });

    it('null restorePolicy is treated as auto and included', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-session-1',
            cwd: null,
            restorePolicy: null,
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].action).toBe(RESTORE_ACTION.RESUME_OPENCODE_SESSION);
    });

    it('invalid string value is treated as auto and included', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-session-1',
            cwd: null,
            restorePolicy: 'garbage-value',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].action).toBe(RESTORE_ACTION.RESUME_OPENCODE_SESSION);
    });

    it('empty string restorePolicy is treated as auto and included', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-session-1',
            cwd: null,
            restorePolicy: '',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].action).toBe(RESTORE_ACTION.RESUME_OPENCODE_SESSION);
    });
  });

  // -------------------------------------------------------------------------
  // Mixed policies in same workspace
  // -------------------------------------------------------------------------
  describe('mixed policies in the same workspace', () => {
    it('auto + manual + off produce correct actions', () => {
      const manifest = makeManifest({
        terminalSessions: [
          // auto → included
          {
            terminalId: 't-auto',
            panelId: 'p-auto',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-auto',
            cwd: null,
            restorePolicy: 'auto',
          },
          // manual → TERMINATED
          {
            terminalId: 't-manual',
            panelId: 'p-manual',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-manual',
            cwd: null,
            restorePolicy: 'manual',
          },
          // off → skipped
          {
            terminalId: 't-off',
            panelId: 'p-off',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-off',
            cwd: null,
            restorePolicy: 'off',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      // auto included, manual terminated, off skipped → 2 actions
      expect(plan.actions).toHaveLength(2);

      const autoAction = plan.actions.find((a) => a.terminalId === 't-auto');
      expect(autoAction.action).toBe(RESTORE_ACTION.RESUME_OPENCODE_SESSION);

      const manualAction = plan.actions.find((a) => a.terminalId === 't-manual');
      expect(manualAction.action).toBe(RESTORE_ACTION.TERMINATED);
      expect(manualAction.reason).toBe('restore-policy-manual');

      // t-off not in actions
      expect(plan.actions.find((a) => a.terminalId === 't-off')).toBeUndefined();
    });

    it('only manual sessions in workspace — all become TERMINATED, none are skipped', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-1',
            cwd: null,
            restorePolicy: 'manual',
          },
          {
            terminalId: 't2',
            panelId: 'p2',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-2',
            cwd: null,
            restorePolicy: 'manual',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(2);
      expect(plan.actions.every((a) => a.action === RESTORE_ACTION.TERMINATED)).toBe(true);
    });

    it('only off sessions in workspace — zero actions emitted', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-1',
            cwd: null,
            restorePolicy: 'off',
          },
          {
            terminalId: 't2',
            panelId: 'p2',
            workspaceId: 'ws1',
            opencodeSessionId: null,
            cwd: '/tmp',
            restorePolicy: 'off',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Deduplication still works with policy gating
  // -------------------------------------------------------------------------
  describe('deduplication with mixed policies', () => {
    it('duplicate terminalId with different policies — only one action per terminalId', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 't1',
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-1',
            cwd: null,
            restorePolicy: 'auto',
          },
          {
            terminalId: 't1', // duplicate terminalId
            panelId: 'p1',
            workspaceId: 'ws1',
            opencodeSessionId: 'oc-1',
            cwd: null,
            restorePolicy: 'manual', // different policy — but same terminalId
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      // deduplication keeps first matching key
      expect(plan.actions).toHaveLength(1);
    });
  });

  describe('TUI launch commands', () => {
    it('kimi panel does not emit RESTORE_SHELL_EMERGENT', () => {
      const manifest = makeManifest({
        terminalSessions: [
          {
            terminalId: 'k1',
            panelId: 'k1',
            workspaceId: 'ws1',
            opencodeSessionId: null,
            cwd: '/home/user',
            initialCommand: 'kimi',
            sessionKind: 'generic',
            restorePolicy: 'auto',
          },
        ],
      });

      const plan = buildStartupRestorePlan({
        manifest,
        runtimeSnapshot: makeMinimalRuntime(),
      });

      expect(plan.actions.some((a) => a.action === RESTORE_ACTION.RESTORE_SHELL_EMERGENT)).toBe(
        false
      );
    });
  });

  // -------------------------------------------------------------------------
  // RESTORE_ACTION.TERMINATED exists
  // -------------------------------------------------------------------------
  describe('RESTORE_ACTION enum includes TERMINATED', () => {
    it('RESTORE_ACTION.TERMINATED is defined', () => {
      expect(RESTORE_ACTION.TERMINATED).toBeDefined();
      expect(typeof RESTORE_ACTION.TERMINATED).toBe('string');
    });
  });
});
