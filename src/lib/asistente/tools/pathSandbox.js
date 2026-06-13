// Path sandbox for file-accessing tools (`browse_files`, `review_log_file`).
// Resolves a project root from `DEVHUB_PROJECT_ROOT` (fallback `process.cwd()`)
// and rejects any path that is not:
//   - the root itself
//   - a subpath of the root
//   - a path under `<root>/.devhub/`
//   - a path under `/tmp/devhub-*`
//
// This is the only place in the codebase that decides whether a tool may
// touch a file. `path.resolve()` is `..`-aware so escapes are caught.

import path from 'node:path';
import os from 'node:os';

const DEV_TMP_PREFIX = path.join(os.tmpdir(), 'devhub-');

export function resolveProjectRoot() {
  return process.env.DEVHUB_PROJECT_ROOT || process.cwd();
}

export function assertWithinRoot(p) {
  const resolved = path.resolve(p);
  const root = resolveProjectRoot();

  if (resolved === root) return true;
  if (resolved.startsWith(root + path.sep)) return true;
  if (resolved.startsWith(path.join(root, '.devhub') + path.sep)) return true;
  if (resolved.startsWith(DEV_TMP_PREFIX)) return true;
  return false;
}
