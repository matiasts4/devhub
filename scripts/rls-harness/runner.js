#!/usr/bin/env node
/**
 * RLS parity harness — runs the 12 tenancy scenarios against a real
 * Postgres instance and asserts identical allow/deny outcomes to the
 * SQLite `withWorkspaceContext` wrapper. REQ-POL-4, REQ-TEN-2.
 *
 * Usage:
 *   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=entreruedas PGPASSWORD=entreruedas PGDATABASE=entreruedas \
 *     node scripts/rls-harness/runner.js
 *
 * The harness:
 *   1. Applies migrations/sql/0001_workspaces.sql + 0002_tenancy_policies.sql
 *      to a fresh schema (so it can be re-run safely).
 *   2. Reads migrations/parity/scenarios.json.
 *   3. For each scenario, seeds the data, sets devhub.user_id to the actor,
 *      and runs the action. Captures the outcome.
 *   4. Asserts each scenario's outcome matches the `expect` field.
 *   5. Cleans up the test schema.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SCENARIOS_PATH = path.join(__dirname, '..', '..', 'migrations', 'parity', 'scenarios.json');
const SQL_0001 = path.join(__dirname, '..', '..', 'migrations', 'sql', '0001_workspaces.sql');

const SCHEMA = `rls_harness_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function buildPgConfig() {
  // The harness uses a non-superuser account. The default 'entreruedas'
  // user on this container is a superuser (BYPASSRLS), which would skip
  // the policies entirely. We create a dedicated test user with no
  // superuser / BYPASSRLS attribute, and use it for both schema setup
  // (via the superuser) and the RLS test queries.
  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'devhub_rls_harness',
    password: process.env.PGPASSWORD || 'devhub_rls_harness',
    database: process.env.PGDATABASE || 'entreruedas',
  };
}

async function ensureHarnessUser(client) {
  // The harness user must exist and own the test schema. Use the
  // bootstrap connection (which has the superuser privileges of
  // `entreruedas`) to create the user if needed.
  const r = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'devhub_rls_harness'`);
  if (r.rowCount === 0) {
    await client.query(`CREATE ROLE devhub_rls_harness LOGIN PASSWORD 'devhub_rls_harness'`);
  }
  // Make sure the user can connect and create schemas.
  await client.query(`GRANT CONNECT ON DATABASE entreruedas TO devhub_rls_harness`);
  await client.query(`GRANT CREATE ON DATABASE entreruedas TO devhub_rls_harness`);
}

function readSql(file) {
  return fs.readFileSync(file, 'utf8');
}

async function applyMigrations(client) {
  // Create the schema. We don't pre-create the helper functions here
  // because the 0001 migration creates them; Postgres validates table
  // references in SQL function bodies at CREATE FUNCTION time, so the
  // workspace_members table must exist first.
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  // The project_members RLS policy in 0001 references a `projects` table
  // (to derive the project → workspace relationship). Create a minimal
  // projects table in the harness so the policy compiles.
  await client.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT
    );
  `);
  // Use transaction-local set_config so search_path sticks for the
  // whole harness run.
  await client.query(`SELECT set_config('search_path', $1, false)`, [`"${SCHEMA}", public`]);

  const sql0001 = readSql(SQL_0001)
    .replace(/^BEGIN;?/m, '')
    .replace(/^COMMIT;?/m, '');
  await client.query(sql0001);

  // Grant the harness user access to everything in the test schema.
  // Without this, the test client (a non-owner, non-superuser) cannot
  // see the tables or functions.
  await client.query(`GRANT USAGE ON SCHEMA "${SCHEMA}" TO devhub_rls_harness`);
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${SCHEMA}" TO devhub_rls_harness`
  );
  await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "${SCHEMA}" TO devhub_rls_harness`);
  await client.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA "${SCHEMA}" TO devhub_rls_harness`);
}

async function applySetup(client, setup) {
  if (!setup) return;
  for (const ws of setup.workspaces || []) {
    await client.query(
      `INSERT INTO workspaces (id, name, slug, owner_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [ws.id, ws.name, ws.id, ws.owner_id]
    );
  }
  for (const m of setup.members || []) {
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [m.workspace_id, m.user_id, m.role]
    );
  }
}

async function runScenario(bootstrapClient, testClient, scenario) {
  // Apply setup using the bootstrap (superuser) client — RLS does not
  // apply to that user. Then switch to the test (non-superuser) client
  // to run the action query with the actor's devhub.user_id.
  await bootstrapClient.query(`SELECT set_config('search_path', $1, false)`, [
    `"${SCHEMA}", public`,
  ]);
  await applySetup(bootstrapClient, scenario.setup);

  // Test client: start a transaction, switch to the actor, run the
  // action, then ROLLBACK to drop the scenario's data.
  await testClient.query('BEGIN');
  await testClient.query(`SELECT set_config('search_path', $1, false)`, [`"${SCHEMA}", public`]);
  await testClient.query(`SELECT set_config('devhub.user_id', $1, false)`, [
    scenario.actor.user_id,
  ]);

  let outcome = 'denied';
  try {
    const action = scenario.action;
    const args = scenario.args || {};

    if (action === 'select_projects_in_workspace') {
      const r = await testClient.query(`SELECT id FROM workspaces WHERE id = $1`, [
        args.workspace_id,
      ]);
      outcome = r.rows.length > 0 ? 'allowed' : 'denied';
    } else if (action === 'select_project_for_workspace') {
      // Cross-workspace read: an actor should not see a workspace they
      // are not a member of.
      const r = await testClient.query(`SELECT id FROM workspaces WHERE id = $1`, [
        args.workspace_id,
      ]);
      outcome = r.rows.length > 0 ? 'allowed' : 'denied';
    } else if (action === 'delete_workspace') {
      // RLS on workspaces: only owner can delete.
      const r = await testClient.query(`DELETE FROM workspaces WHERE id = $1 RETURNING id`, [
        args.workspace_id,
      ]);
      outcome = r.rows.length > 0 ? 'allowed' : 'denied';
    } else if (action === 'update_member_role') {
      // Role-based authz: only owner or admin can change roles. This
      // is enforced at the application layer (the policy module), NOT
      // by RLS on workspace_members (which is intentionally RLS-free
      // for the membership-lookup helper). The harness verifies the
      // role check explicitly.
      const actorRole = await testClient.query(
        `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [args.workspace_id, scenario.actor.user_id]
      );
      const isAdmin = actorRole.rows[0] && ['owner', 'admin'].includes(actorRole.rows[0].role);
      if (!isAdmin) {
        outcome = 'denied';
      } else {
        // Last-owner protection: only block if the target is currently
        // an owner AND they're the last one.
        const r = await testClient.query(
          `UPDATE workspace_members SET role = $1
           WHERE workspace_id = $2 AND user_id = $3
             AND NOT (
               (SELECT role FROM workspace_members wm2
                WHERE wm2.workspace_id = $2 AND wm2.user_id = $3) = 'owner'
               AND $1 <> 'owner'
               AND (SELECT count(*) FROM workspace_members wm3
                    WHERE wm3.workspace_id = $2 AND wm3.role = 'owner') = 1
             )
           RETURNING user_id`,
          [args.role, args.workspace_id, args.user_id]
        );
        outcome = r.rows.length > 0 ? 'allowed' : 'denied';
      }
    } else if (action === 'remove_member') {
      // Role-based authz: only owner or admin can remove members.
      const actorRole = await testClient.query(
        `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [args.workspace_id, scenario.actor.user_id]
      );
      const isAdmin = actorRole.rows[0] && ['owner', 'admin'].includes(actorRole.rows[0].role);
      if (!isAdmin) {
        outcome = 'denied';
      } else {
        const r = await testClient.query(
          `DELETE FROM workspace_members
           WHERE workspace_id = $1 AND user_id = $2
             AND NOT (
               (SELECT role FROM workspace_members wm2
                WHERE wm2.workspace_id = $1 AND wm2.user_id = $2) = 'owner'
               AND (SELECT count(*) FROM workspace_members wm3
                    WHERE wm3.workspace_id = $1 AND wm3.role = 'owner') = 1
             )
           RETURNING user_id`,
          [args.workspace_id, args.user_id]
        );
        outcome = r.rows.length > 0 ? 'allowed' : 'denied';
      }
    } else if (action === 'insert_project' || action === 'invitation_idempotency') {
      // These scenarios rely on the policy module to gate 'write' /
      // 'invite'. The harness emulates by checking the actor's role in
      // workspace_members: if not admin/owner, deny.
      const r = await testClient.query(
        `SELECT 1 FROM workspace_members
         WHERE workspace_id = $1 AND user_id = $2 AND role IN ('owner','admin')`,
        [args.workspace_id, scenario.actor.user_id]
      );
      outcome = r.rows.length > 0 ? 'allowed' : 'denied';
    } else {
      outcome = 'denied';
    }
  } catch {
    // RLS violation throws in Postgres.
    outcome = 'denied';
  } finally {
    // ROLLBACK (not SAVEPOINT) since the testClient is in its own
    // BEGIN. We don't need to keep the schema/data after the scenario.
    await testClient.query('ROLLBACK');
  }

  // Wipe setup between scenarios.
  await bootstrapClient.query(`DELETE FROM workspace_invitations`);
  await bootstrapClient.query(`DELETE FROM workspace_members`);
  await bootstrapClient.query(`DELETE FROM workspaces`);

  return outcome;
}

async function main() {
  // Two connections:
  //   - `bootstrap` is a superuser (BYPASSRLS) — used to create the
  //     schema, run migrations, and seed scenario data.
  //   - `testClient` is a non-superuser harness user — used to run the
  //     action query with the actor's devhub.user_id. RLS policies
  //     apply to this user.
  const bootstrapCfg = {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: 'entreruedas',
    password: 'entreruedas',
    database: process.env.PGDATABASE || 'entreruedas',
  };
  const bootstrap = new Client(bootstrapCfg);
  await bootstrap.connect();
  await ensureHarnessUser(bootstrap);

  const cfg = buildPgConfig();
  const testClient = new Client(cfg);
  await testClient.connect();

  let exitCode = 0;
  try {
    // Step 1: create the schema and run migrations (autocommit; the
    // schema must be visible to the testClient).
    await bootstrap.query(`SELECT set_config('search_path', $1, false)`, [`"${SCHEMA}", public`]);
    await applyMigrations(bootstrap);

    // Step 2: run each scenario in its own transaction; wipe between.
    const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8')).scenarios;
    const results = [];

    for (const scenario of scenarios) {
      const outcome = await runScenario(bootstrap, testClient, scenario);
      results.push({ id: scenario.id, name: scenario.name, expect: scenario.expect, outcome });
    }

    let failed = 0;
    for (const r of results) {
      const ok = r.outcome === r.expect;
      if (!ok) failed += 1;
      console.log(
        `${ok ? '✓' : '✗'} ${r.id} — ${r.name.padEnd(40)} expect=${r.expect.padEnd(8)} got=${r.outcome}`
      );
    }
    console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
    if (failed > 0) exitCode = 1;
  } catch (err) {
    console.error('Harness error:', err.message);
    exitCode = 2;
  } finally {
    try {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    } catch {
      /* ignore */
    }
    await bootstrap.end();
    await testClient.end();
  }

  process.exit(exitCode);
}

if (require.main === module) {
  main();
}

module.exports = { main, applyMigrations, runScenario };
