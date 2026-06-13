'use strict';

/**
 * withWorkspaceContext wrapper for the SQLite path.
 *
 * Mirrors the Postgres RLS contract: every operation that touches a
 * workspace-scoped table runs inside this wrapper, which:
 *   1. asserts the actor is a member of the requested workspace;
 *   2. sets a per-request context (actor + workspaceId);
 *   3. runs `fn(db)` with the scoped context;
 *   4. clears the context on exit (no leakage across requests).
 *
 * Refs: REQ-POL-3.
 */

const { can, assertCan } = require('./policy.js');

/**
 * @typedef {Object} ContextState
 * @property {string|null} actorUserId
 * @property {string|null} workspaceId
 * @property {string|null} projectId
 */

const noopState = () => ({ actorUserId: null, workspaceId: null, projectId: null });

const state = noopState();

/**
 * Read the current workspace context. For test introspection.
 * @returns {ContextState}
 */
function getCurrentContext() {
  return { ...state };
}

/**
 * Reset the module-level state. Test-only helper.
 */
function resetWorkspaceContextForTests() {
  state.actorUserId = null;
  state.workspaceId = null;
  state.projectId = null;
}

/**
 * Look up the actor's role in the workspace. Throws `PermissionError` on
 * missing membership.
 *
 * @param {{userId:string, workspaceMemberships:Array<{workspaceId:string, role:string}>}} actor
 * @param {string} workspaceId
 * @returns {string} the role
 */
function findRole(actor, workspaceId) {
  const match = (actor.workspaceMemberships || []).find((m) => m.workspaceId === workspaceId);
  if (!match) {
    const err = new Error(`actor ${actor.userId} is not a member of workspace ${workspaceId}`);
    err.name = 'PermissionError';
    err.code = 'permission_denied';
    err.actor = actor.userId;
    err.resource = workspaceId;
    throw err;
  }
  return match.role;
}

/**
 * @param {{userId:string, workspaceMemberships:Array<{workspaceId:string, role:string}>}} actor
 * @param {string} workspaceId
 * @param {(db:any) => Promise<T>|T} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withWorkspaceContext(actor, workspaceId, fn) {
  if (!actor || !actor.userId) {
    throw new Error('withWorkspaceContext: actor with userId is required');
  }
  if (!workspaceId) {
    throw new Error('withWorkspaceContext: workspaceId is required');
  }
  if (typeof fn !== 'function') {
    throw new Error('withWorkspaceContext: fn must be a function');
  }

  // Find role BEFORE setting state — this way, if the actor is not a
  // member, the state is never touched and leakage is impossible.
  const role = findRole(actor, workspaceId);

  // Set the context.
  const previous = { ...state };
  state.actorUserId = actor.userId;
  state.workspaceId = workspaceId;
  state.projectId = null;

  try {
    // Reentrant check: each call snapshots its previous state, so nested
    // calls are independent. The outer call's state is restored on exit
    // regardless of what inner calls do.
    const effectiveActor = {
      userId: actor.userId,
      workspaceRole: role,
      projectRole: actor.projectRole,
    };
    return await fn({
      _context: { actor: effectiveActor, workspaceId },
    });
  } finally {
    state.actorUserId = previous.actorUserId;
    state.workspaceId = previous.workspaceId;
    state.projectId = previous.projectId;
  }
}

/**
 * Assert the current context has the required permission. Used by tools
 * (e.g. `workspace.add_member`) to gate writes without having to set
 * another wrapper.
 *
 * @param {string} action
 * @param {{projectId?:string}} [target]
 */
function assertCurrentContextCan(action, target = {}) {
  if (!state.actorUserId) {
    throw new Error('assertCurrentContextCan: no active workspace context');
  }
  if (!state.workspaceId) {
    throw new Error('assertCurrentContextCan: no active workspace id');
  }
  // The role is the actor's role in this workspace; this must be
  // injected by the caller via `withWorkspaceContext` which knows it.
  // The wrapper binds the role into the context, but the policy module
  // expects the role on the actor. We read it from the policy module's
  // table of grants, but we need the role itself. The wrapper does
  // not retain the role; we recover it from the most-recent actor.
  // For external use, prefer `assertCan` with a fully-built actor.
  if (!state._role) {
    throw new Error('assertCurrentContextCan: role not bound (use withWorkspaceContext)');
  }
  const actor = {
    userId: state.actorUserId,
    workspaceRole: state._role,
    projectRole: state._projectRole,
  };
  assertCan(actor, action, { workspaceId: state.workspaceId, projectId: target.projectId });
}

/**
 * Bind a role to the active context. Called by tools that look up the
 * actor's role once (e.g. on tool entry) and then run multiple
 * `assertCurrentContextCan` calls.
 *
 * @param {string} role
 * @param {string} [projectRole]
 */
function bindRoleToContext(role, projectRole) {
  state._role = role;
  state._projectRole = projectRole || null;
}

module.exports = {
  withWorkspaceContext,
  getCurrentContext,
  resetWorkspaceContextForTests,
  findRole,
  assertCurrentContextCan,
  bindRoleToContext,
  can,
};
