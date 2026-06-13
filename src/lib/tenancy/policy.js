'use strict';

/**
 * Tenancy policy module.
 *
 * Single source of truth for "who can do what" in DevHub. Postgres RLS
 * policies (migrations/sql/*.sql) and the SQLite `withWorkspaceContext`
 * wrapper BOTH derive from this module. A parity test enforces that the
 * two enforcement layers cannot silently disagree (REQ-POL-4).
 *
 * Refs: REQ-POL-1, REQ-POL-2, REQ-POL-3.
 */

const { PermissionError } = require('../auth/errors.js');

/**
 * @typedef {('owner'|'admin'|'member'|'viewer')} WorkspaceRole
 * @typedef {('read'|'write'|'admin'|'invite'|'change_roles')} PolicyAction
 *
 * @typedef {Object} PolicyActor
 * @property {string} userId
 * @property {WorkspaceRole} workspaceRole
 * @property {WorkspaceRole} [projectRole]
 *
 * @typedef {Object} PolicyTarget
 * @property {string} [workspaceId]
 * @property {string} [projectId]
 */

const ROLE_HIERARCHY = Object.freeze(['owner', 'admin', 'member', 'viewer']);

const ROLE_GRANTS = Object.freeze({
  owner: { read: true, write: true, admin: true, invite: true, change_roles: true },
  admin: { read: true, write: true, admin: true, invite: true, change_roles: true },
  member: { read: true, write: true, admin: false, invite: false, change_roles: false },
  viewer: { read: true, write: false, admin: false, invite: false, change_roles: false },
});

/**
 * @param {WorkspaceRole} role
 * @returns {{read:boolean,write:boolean,admin:boolean,invite:boolean,change_roles:boolean}}
 */
function grantsFor(role) {
  const grants = ROLE_GRANTS[role];
  if (!grants) {
    throw new PermissionError(`unknown workspace role: ${role}`, { resource: role });
  }
  return grants;
}

/**
 * Project role takes precedence over workspace role for project-scoped
 * checks. REQ-POL-2 + design decision #9 (project membership is a strict
 * subset of workspace membership, project roles override workspace roles
 * per-project).
 *
 * @param {PolicyActor} actor
 * @param {PolicyTarget} target
 * @returns {WorkspaceRole}
 */
function effectiveRole(actor, target) {
  if (target && target.projectId && actor.projectRole) {
    return actor.projectRole;
  }
  return actor.workspaceRole;
}

/**
 * @param {PolicyActor} actor
 * @param {PolicyAction} action
 * @param {PolicyTarget} [target]
 * @returns {boolean}
 */
function can(actor, action, target = {}) {
  if (!actor || typeof actor !== 'object' || !actor.userId) {
    throw new PermissionError('actor is required', { resource: 'actor' });
  }
  if (!target.workspaceId && !target.projectId) {
    throw new PermissionError('workspaceId or projectId is required', { resource: 'target' });
  }
  if (!ROLE_GRANTS[actor.workspaceRole]) {
    throw new PermissionError(`unknown workspace role: ${actor.workspaceRole}`, {
      resource: actor.workspaceRole,
    });
  }
  const role = effectiveRole(actor, target);
  return Boolean(grantsFor(role)[action]);
}

/**
 * @param {PolicyActor} actor
 * @param {string} workspaceId
 * @returns {{read:boolean,write:boolean,admin:boolean,invite:boolean,change_roles:boolean}}
 */
function getEffectivePermissions(actor, workspaceId) {
  if (!actor) {
    throw new PermissionError('actor is required', { resource: 'actor' });
  }
  if (!workspaceId) {
    throw new PermissionError('workspaceId is required', { resource: 'workspaceId' });
  }
  return grantsFor(actor.workspaceRole);
}

/**
 * Throw `PermissionError` if `can(actor, action, target)` is false.
 *
 * @param {PolicyActor} actor
 * @param {PolicyAction} action
 * @param {PolicyTarget} [target]
 */
function assertCan(actor, action, target = {}) {
  if (!can(actor, action, target)) {
    const role = effectiveRole(actor, target);
    const grants = grantsFor(role);
    const required = [];
    for (const [a, allowed] of Object.entries(grants)) {
      if (a === action && !allowed) required.push(`${role}+${a}`);
    }
    throw new PermissionError(
      `actor ${actor.userId} role=${role} action=${action} is not permitted on workspace ${target.workspaceId || '?'}`,
      {
        code: 'permission_denied',
        actor: actor.userId,
        resource: target.workspaceId || target.projectId,
        required: required.join(',') || 'unknown',
      }
    );
  }
}

const assertCanRead = (actor, target) => assertCan(actor, 'read', target);
const assertCanWrite = (actor, target) => assertCan(actor, 'write', target);
const assertCanAdmin = (actor, target) => assertCan(actor, 'admin', target);

module.exports = {
  ROLE_HIERARCHY,
  ROLE_GRANTS,
  can,
  assertCan,
  assertCanRead,
  assertCanWrite,
  assertCanAdmin,
  getEffectivePermissions,
  grantsFor,
  effectiveRole,
};
