import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolve the most recent swarm launch id from durable artifacts.
 * Prefers newest mtime across worktrees, bootstrap locks, and mission event dirs.
 */
export function resolveLatestLaunchId({ root, tmp = '/tmp' } = {}) {
  const candidates = [];

  const worktreeBase = join(root, '.devhub', 'worktrees');
  if (existsSync(worktreeBase)) {
    for (const name of readdirSync(worktreeBase)) {
      const match = name.match(/^(launch-[a-f0-9]+)$/);
      if (!match) continue;
      const filePath = join(worktreeBase, name);
      candidates.push({
        launchId: match[1],
        mtimeMs: statSync(filePath).mtimeMs,
        source: 'worktree',
      });
    }
  }

  if (existsSync(tmp)) {
    for (const name of readdirSync(tmp)) {
      const lockMatch = name.match(/^devhub-bootstrap-(launch-[a-f0-9]+)-.+\.lock$/);
      if (lockMatch) {
        candidates.push({
          launchId: lockMatch[1],
          mtimeMs: statSync(join(tmp, name)).mtimeMs,
          source: 'bootstrap-lock',
        });
        continue;
      }

      const missionMatch = name.match(/^devhub-mission-(launch-[a-f0-9]+)$/);
      if (missionMatch) {
        candidates.push({
          launchId: missionMatch[1],
          mtimeMs: statSync(join(tmp, name)).mtimeMs,
          source: 'mission-events',
        });
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].launchId;
}

export function swarmRoleLogPath(launchId, role, { tmp = '/tmp' } = {}) {
  return join(tmp, `devhub-swarm-${launchId}-${role}.log`);
}

export function swarmRoleLogPathLegacy(role, { tmp = '/tmp' } = {}) {
  return join(tmp, `devhub-swarm-${role}.log`);
}

export function readRoleLog(launchId, role, { tmp = '/tmp', allowLegacyFallback = false } = {}) {
  const scoped = swarmRoleLogPath(launchId, role, { tmp });
  if (existsSync(scoped)) return { path: scoped, text: readFileSync(scoped, 'utf8') };
  if (allowLegacyFallback) {
    const legacy = swarmRoleLogPathLegacy(role, { tmp });
    if (existsSync(legacy)) return { path: legacy, text: readFileSync(legacy, 'utf8') };
  }
  return { path: scoped, text: null };
}

export function logsMentionLaunch(launchId, { tmp = '/tmp', roles = ['director', 'coder', 'auditor', 'devops', 'architect'] } = {}) {
  for (const role of roles) {
    const { text } = readRoleLog(launchId, role, { tmp });
    if (text?.includes(launchId)) return true;
  }
  return false;
}

export function logHasInnerCommandB64(role, launchId = null, { tmp = '/tmp' } = {}) {
  const { text } = launchId
    ? readRoleLog(launchId, role, { tmp })
    : { text: existsSync(swarmRoleLogPathLegacy(role, { tmp })) ? readFileSync(swarmRoleLogPathLegacy(role, { tmp }), 'utf8') : null };
  return Boolean(text && /\[AGENT\] Inner command \(b64\):/.test(text));
}