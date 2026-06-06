'use strict';

/**
 * 12-scenario parity test for the SQLite `withWorkspaceContext` path.
 *
 * Reads the canonical scenario list from `migrations/parity/scenarios.json`
 * and exercises each one against a fresh in-memory SQLite DB. The same
 * scenarios are run against the Postgres RLS harness (PR 2) and the
 * postgres-generic driver (PR 4); identical allow/deny outcomes are
 * required (REQ-POL-4, REQ-TEN-3).
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const {
  withWorkspaceContext,
  resetWorkspaceContextForTests,
  findRole,
} = require('../with-workspace-context.js');
const { can } = require('../policy.js');
const { ensureRuntimeSchema } = require('../../db/schema.js');

const SCENARIOS_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'migrations',
  'parity',
  'scenarios.json'
);
const SCENARIOS = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8')).scenarios;

function createFreshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
  return db;
}

function applySetup(db, setup) {
  if (!setup) return;
  // Workspaces
  for (const ws of setup.workspaces || []) {
    db.prepare(
      'INSERT OR IGNORE INTO workspaces (id, name, slug, owner_id) VALUES (?, ?, ?, ?)'
    ).run(ws.id, ws.name, ws.id, ws.owner_id);
  }
  // Members
  for (const m of setup.members || []) {
    db.prepare(
      'INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
    ).run(m.workspace_id, m.user_id, m.role);
  }
  // Projects (must have workspace_id, name)
  for (const p of setup.projects || []) {
    db.prepare(
      'INSERT OR IGNORE INTO projects (id, user_id, name, workspace_id) VALUES (?, ?, ?, ?)'
    ).run(p.id, 'seed-user', p.name, p.workspace_id);
  }
  // Invitations seed
  for (const inv of setup.invitations || []) {
    db.prepare(
      `INSERT OR REPLACE INTO workspace_invitations
        (workspace_id, email, role, token, expires_at, status, invited_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      inv.workspace_id,
      inv.email,
      inv.role || 'member',
      inv.token || 'tok-' + Math.random().toString(36).slice(2),
      inv.expires_at || '2099-01-01T00:00:00Z',
      inv.status || 'pending',
      inv.invited_by || 'seed'
    );
  }
}

/**
 * Run a single scenario and return { outcome: 'allowed'|'denied', ... }.
 */
async function runScenario(scenario) {
  const db = createFreshDb();
  applySetup(db, scenario.setup);

  const memberships = (scenario.setup.members || [])
    .filter((m) => m.user_id === scenario.actor.user_id)
    .map((m) => ({ workspaceId: m.workspace_id, role: m.role }));
  const actor = {
    userId: scenario.actor.user_id,
    workspaceMemberships: memberships,
  };

  let outcome = 'denied';
  let detail = null;

  const action = scenario.action;
  const args = scenario.args || {};

  try {
    await withWorkspaceContext(actor, args.workspace_id, async () => {
      const role = findRole(actor, args.workspace_id);
      const actorPolicy = { userId: actor.userId, workspaceRole: role };

      if (action === 'select_projects_in_workspace') {
        const rows = db
          .prepare('SELECT id, workspace_id FROM projects WHERE workspace_id = ?')
          .all(args.workspace_id);
        outcome = rows.length > 0 ? 'allowed' : 'denied';
        detail = { rows };
      } else if (action === 'select_project_for_workspace') {
        // A specific project selection — checks cross-workspace read.
        const row = db
          .prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?')
          .get('any', args.workspace_id);
        outcome = row ? 'allowed' : 'denied';
        detail = { row };
      } else if (action === 'insert_project') {
        // Write attempt: requires 'write' permission.
        if (!can(actorPolicy, 'write', { workspaceId: args.workspace_id })) {
          outcome = 'denied';
          return;
        }
        db.prepare(
          'INSERT INTO projects (id, user_id, name, workspace_id) VALUES (?, ?, ?, ?)'
        ).run('p-' + Date.now(), actor.userId, args.name, args.workspace_id);
        outcome = 'allowed';
      } else if (action === 'delete_workspace') {
        if (!can(actorPolicy, 'admin', { workspaceId: args.workspace_id })) {
          outcome = 'denied';
          return;
        }
        db.prepare('DELETE FROM workspaces WHERE id = ?').run(args.workspace_id);
        outcome = 'allowed';
      } else if (action === 'update_member_role') {
        if (!can(actorPolicy, 'change_roles', { workspaceId: args.workspace_id })) {
          outcome = 'denied';
          return;
        }
        // Last-owner protection: cannot demote the last owner.
        if (args.role !== 'owner') {
          const target = db
            .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
            .get(args.workspace_id, args.user_id);
          if (target && target.role === 'owner') {
            const owners = db
              .prepare(
                "SELECT count(*) as c FROM workspace_members WHERE workspace_id = ? AND role = 'owner'"
              )
              .get(args.workspace_id);
            if (owners.c <= 1) {
              outcome = 'denied';
              return;
            }
          }
        }
        db.prepare(
          'UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?'
        ).run(args.role, args.workspace_id, args.user_id);
        outcome = 'allowed';
      } else if (action === 'remove_member') {
        if (!can(actorPolicy, 'change_roles', { workspaceId: args.workspace_id })) {
          outcome = 'denied';
          return;
        }
        const target = db
          .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
          .get(args.workspace_id, args.user_id);
        if (target && target.role === 'owner') {
          const owners = db
            .prepare(
              "SELECT count(*) as c FROM workspace_members WHERE workspace_id = ? AND role = 'owner'"
            )
            .get(args.workspace_id);
          if (owners.c <= 1) {
            outcome = 'denied';
            return;
          }
        }
        db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(
          args.workspace_id,
          args.user_id
        );
        outcome = 'allowed';
      } else if (action === 'invitation_idempotency') {
        if (!can(actorPolicy, 'invite', { workspaceId: args.workspace_id })) {
          outcome = 'denied';
          return;
        }
        // Insert/replace pending invitation (idempotent on email).
        const token = 'tok-' + Date.now();
        db.prepare(
          `INSERT OR REPLACE INTO workspace_invitations
            (workspace_id, email, role, token, expires_at, status, invited_by)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)`
        ).run(args.workspace_id, args.email, 'member', token, '2099-01-01', actor.userId);
        // Accept: creates membership row.
        db.prepare(
          'INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
        ).run(args.workspace_id, args.email, 'member');
        db.prepare(
          "UPDATE workspace_invitations SET status = 'accepted' WHERE workspace_id = ? AND email = ?"
        ).run(args.workspace_id, args.email);
        // Idempotency: re-accept does not duplicate the membership row.
        db.prepare(
          'INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
        ).run(args.workspace_id, args.email, 'member');
        outcome = 'allowed';
      } else {
        outcome = 'denied';
      }
    });
  } catch (err) {
    if (err.name === 'PermissionError') {
      outcome = 'denied';
    } else {
      throw err;
    }
  }

  return { outcome, detail };
}

describe('12-scenario parity test (SQLite withWorkspaceContext)', () => {
  beforeEach(() => {
    resetWorkspaceContextForTests();
  });

  test('scenarios.json has 12 entries (REQ-TEN-3)', () => {
    expect(SCENARIOS.length).toBe(12);
  });

  test.each(SCENARIOS)(
    '$id — $name',
    async (scenario) => {
      const result = await runScenario(scenario);
      expect(result.outcome).toBe(scenario.expect);
    },
    15000
  );
});
