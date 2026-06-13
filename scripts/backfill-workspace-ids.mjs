#!/usr/bin/env node
/**
 * Backfill workspace_id on tasks/milestones from their parent project.
 * Uses Supabase service role (no DATABASE_URL required).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, '.env.local'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const sb = createClient(url, key);

const { data: projects, error: pErr } = await sb
  .from('projects')
  .select('id, workspace_id')
  .not('workspace_id', 'is', null);

if (pErr) {
  console.error('❌ Failed to load projects:', pErr.message);
  process.exit(1);
}

let taskUpdates = 0;
let milestoneUpdates = 0;

for (const project of projects || []) {
  const { count: taskCount, error: tCountErr } = await sb
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project.id)
    .is('workspace_id', null);

  if (!tCountErr && taskCount > 0) {
    const { error } = await sb
      .from('tasks')
      .update({ workspace_id: project.workspace_id })
      .eq('project_id', project.id)
      .is('workspace_id', null);
    if (error) console.error(`tasks update failed for ${project.id}:`, error.message);
    else taskUpdates += taskCount;
  }

  const { count: msCount, error: mCountErr } = await sb
    .from('milestones')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project.id)
    .is('workspace_id', null);

  if (!mCountErr && msCount > 0) {
    const { error } = await sb
      .from('milestones')
      .update({ workspace_id: project.workspace_id })
      .eq('project_id', project.id)
      .is('workspace_id', null);
    if (error) console.error(`milestones update failed for ${project.id}:`, error.message);
    else milestoneUpdates += msCount;
  }
}

console.log(`✅ Backfill complete: ${taskUpdates} tasks, ${milestoneUpdates} milestones updated.`);