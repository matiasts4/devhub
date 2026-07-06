#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'src/lib/terminal/sidecarAgentDetectionEntry.js');
const outfile = path.join(root, 'sidecar-backend/bundled/agentDetection.cjs');

const result = spawnSync(
  'npx',
  ['--yes', 'esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${outfile}`],
  { cwd: root, stdio: 'inherit', shell: true }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
console.log('Wrote', outfile);