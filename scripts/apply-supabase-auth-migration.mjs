#!/usr/bin/env node
/**
 * Apply collaborative auth migration to the live Supabase Postgres database.
 *
 * Requires DATABASE_URL in .env.local (Supabase Dashboard → Settings → Database
 * → Connection string → URI, mode Session).
 *
 * Usage:
 *   node scripts/apply-supabase-auth-migration.mjs
 *   node scripts/apply-supabase-auth-migration.mjs migrations/20260608_collaborative_auth.sql
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, '.env.local'));
loadEnvFile(path.join(ROOT, '.env'));

const migrationPath =
  process.argv[2] || path.join(ROOT, 'migrations', '20260608_collaborative_auth.sql');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(
    '❌ DATABASE_URL is required.\n' +
      '   Add it to .env.local from Supabase Dashboard → Settings → Database → Connection string (URI).\n' +
      '   Example:\n' +
      '   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'
  );
  process.exit(1);
}

if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`Applying migration: ${path.basename(migrationPath)}`);
  await client.query(sql);
  console.log('✅ Migration applied successfully.');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}