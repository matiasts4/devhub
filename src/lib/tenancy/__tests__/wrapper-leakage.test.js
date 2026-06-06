'use strict';

/**
 * Verifies the SQLite `withWorkspaceContext` wrapper has no state leakage
 * across calls. REQ-POL-3.
 */

const {
  withWorkspaceContext,
  getCurrentContext,
  resetWorkspaceContextForTests,
} = require('../with-workspace-context.js');

const ACTOR_W1 = {
  userId: 'alice',
  workspaceMemberships: [{ workspaceId: 'W1', role: 'admin' }],
};

const ACTOR_W2 = {
  userId: 'bob',
  workspaceMemberships: [{ workspaceId: 'W2', role: 'member' }],
};

describe('withWorkspaceContext wrapper (REQ-POL-3)', () => {
  beforeEach(() => {
    resetWorkspaceContextForTests();
  });

  test('throws PermissionError when actor is not a member of the workspace', async () => {
    await expect(withWorkspaceContext(ACTOR_W1, 'W9', async () => 'never')).rejects.toThrow(
      /not a member of workspace W9/
    );
  });

  test('clears the context after the wrapper returns (no leakage)', async () => {
    await withWorkspaceContext(ACTOR_W1, 'W1', async () => {
      const ctx = getCurrentContext();
      expect(ctx.actorUserId).toBe('alice');
      expect(ctx.workspaceId).toBe('W1');
    });
    const after = getCurrentContext();
    expect(after.actorUserId).toBeNull();
    expect(after.workspaceId).toBeNull();
  });

  test('clears the context even when the inner function throws', async () => {
    await expect(
      withWorkspaceContext(ACTOR_W1, 'W1', async () => {
        throw new Error('inner failure');
      })
    ).rejects.toThrow(/inner failure/);
    const after = getCurrentContext();
    expect(after.actorUserId).toBeNull();
    expect(after.workspaceId).toBeNull();
  });

  test('is reentrant — inner call does not leak to outer', async () => {
    let outerSawInnerState = null;
    await withWorkspaceContext(ACTOR_W1, 'W1', async () => {
      // Inner call with a different workspace + actor.
      await withWorkspaceContext(ACTOR_W2, 'W2', async () => {
        const inner = getCurrentContext();
        expect(inner.workspaceId).toBe('W2');
        expect(inner.actorUserId).toBe('bob');
      });
      // After inner returns, the outer state must be intact.
      outerSawInnerState = getCurrentContext();
    });
    expect(outerSawInnerState.workspaceId).toBe('W1');
    expect(outerSawInnerState.actorUserId).toBe('alice');
  });

  test('inner failure does not corrupt the outer context', async () => {
    let outerState = null;
    await expect(
      withWorkspaceContext(ACTOR_W1, 'W1', async () => {
        try {
          await withWorkspaceContext(ACTOR_W2, 'W2', async () => {
            throw new Error('inner failure');
          });
        } catch (e) {
          /* swallow */
        }
        outerState = getCurrentContext();
      })
    ).resolves.toBeUndefined();
    expect(outerState.workspaceId).toBe('W1');
    expect(outerState.actorUserId).toBe('alice');
  });

  test('clears the context on synchronous return', async () => {
    const result = await withWorkspaceContext(ACTOR_W1, 'W1', () => 'value');
    expect(result).toBe('value');
    const after = getCurrentContext();
    expect(after.workspaceId).toBeNull();
  });

  test('rejects when actor is missing', async () => {
    await expect(withWorkspaceContext(null, 'W1', async () => 'never')).rejects.toThrow(
      /actor with userId is required/
    );
  });

  test('rejects when workspaceId is missing', async () => {
    await expect(withWorkspaceContext(ACTOR_W1, '', async () => 'never')).rejects.toThrow(
      /workspaceId is required/
    );
  });
});
