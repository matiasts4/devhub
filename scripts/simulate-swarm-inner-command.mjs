/**
 * Simulate the fixed swarm inner command inside a tmux session (no DevHub UI).
 * Proves opencode starts without double-tmux attach.
 */

import { execSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SESSION = 'devhub-swarm-verify-sim-director';
const CWD = ROOT;
const INNER = '/home/matias/.opencode/bin/opencode --pure --agent swarm-director --model minimax-coding-plan/MiniMax-M2.7';

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function cleanup() {
  try {
    sh(`tmux kill-session -t ${SESSION} 2>/dev/null || true`);
  } catch {
    // ignore
  }
}

cleanup();

sh(
  `tmux new-session -A -d -s ${SESSION} -c ${JSON.stringify(CWD)} ${JSON.stringify(`(${INNER}); echo SIM_EXIT:$?`)}`
);

let ready = false;
for (let i = 0; i < 20; i += 1) {
  try {
    sh('pgrep -af "[o]pencode.*--agent"');
    ready = true;
    break;
  } catch {
    // not yet
  }
  execSync('sleep 1');
}

cleanup();

if (!ready) {
  console.error('FAIL: opencode --agent did not appear within 20s');
  process.exit(1);
}

console.log('PASS: opencode --pure --agent started inside devhub-swarm-style tmux session');
process.exit(0);