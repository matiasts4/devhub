'use strict';

/**
 * Policy module truth-table tests.
 *
 * Exercises every (role × action × target) combination over the
 * 4 roles × 5 actions matrix. REQ-POL-1, REQ-POL-2.
 */

const { can, ROLE_HIERARCHY, getEffectivePermissions } = require('../policy.js');

const ROLES = ['owner', 'admin', 'member', 'viewer'];
const ACTIONS = ['read', 'write', 'admin', 'invite', 'change_roles'];

/** Role→grant lookup per design open question. */
const EXPECTED_GRANTS = {
  owner: { read: true, write: true, admin: true, invite: true, change_roles: true },
  admin: { read: true, write: true, admin: true, invite: true, change_roles: true },
  member: { read: true, write: true, admin: false, invite: false, change_roles: false },
  viewer: { read: true, write: false, admin: false, invite: false, change_roles: false },
};

describe('Tenancy policy module (REQ-POL-1, REQ-POL-2)', () => {
  describe('ROLE_HIERARCHY is the single source of truth', () => {
    test('is owner > admin > member > viewer', () => {
      expect(ROLE_HIERARCHY).toEqual(['owner', 'admin', 'member', 'viewer']);
    });

    test('adding a new role makes parity test fail (single source invariant)', () => {
      // The design says: a change to the hierarchy propagates everywhere.
      // We assert the current shape; if it changes, the test must change
      // and the 12-scenario parity matrix must also be re-run.
      expect(ROLES.length).toBe(ROLE_HIERARCHY.length);
    });
  });

  describe('can() truth table — workspace scope', () => {
    test.each(ROLES)('role=%s has expected grants', (role) => {
      const actor = { userId: 'u1', workspaceRole: role };
      const expected = EXPECTED_GRANTS[role];
      for (const action of ACTIONS) {
        const actual = can(actor, action, { workspaceId: 'W1' });
        expect(actual).toBe(expected[action]);
      }
    });
  });

  describe('can() requires a workspace context', () => {
    test('throws when no workspace is provided', () => {
      expect(() => can({ userId: 'u1', workspaceRole: 'admin' }, 'read', {})).toThrow();
    });

    test('throws when actor is missing', () => {
      expect(() => can(null, 'read', { workspaceId: 'W1' })).toThrow();
    });
  });

  describe('can() honors project scope override', () => {
    test('project role supersedes workspace role for project scope', () => {
      // Actor is admin in workspace, viewer in project — project role wins.
      const actor = { userId: 'u1', workspaceRole: 'admin', projectRole: 'viewer' };
      expect(can(actor, 'write', { workspaceId: 'W1', projectId: 'P1' })).toBe(false);
    });

    test('project member role is honored on the project scope', () => {
      const actor = { userId: 'u1', workspaceRole: 'viewer', projectRole: 'member' };
      expect(can(actor, 'write', { workspaceId: 'W1', projectId: 'P1' })).toBe(true);
    });
  });

  describe('getEffectivePermissions()', () => {
    test('admin returns the full grant set', () => {
      const actor = { userId: 'u1', workspaceRole: 'admin' };
      const perms = getEffectivePermissions(actor, 'W1');
      expect(perms).toMatchObject({
        read: true,
        write: true,
        admin: true,
        invite: true,
        change_roles: true,
      });
    });

    test('viewer returns only read=true', () => {
      const actor = { userId: 'u1', workspaceRole: 'viewer' };
      const perms = getEffectivePermissions(actor, 'W1');
      expect(perms.read).toBe(true);
      expect(perms.write).toBe(false);
      expect(perms.admin).toBe(false);
      expect(perms.invite).toBe(false);
      expect(perms.change_roles).toBe(false);
    });
  });
});
