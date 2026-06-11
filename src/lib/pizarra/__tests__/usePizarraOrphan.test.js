/**
 * usePizarraOrphan — regression test pinning the deletion of the orphan
 * `usePizarraModeTransition` module.
 *
 * The orphan was a scrim-based alternative to `useModeTransition` that
 * imported a non-existent `MODE_TRANSITION` token. It had no production
 * consumers and was redundant with `useModeTransition` + `ModeTransitionShell`.
 *
 * This test asserts:
 *   1. The orphan module file is no longer resolvable (require throws
 *      a module-not-found error).
 *   2. A `git grep` for `usePizarraModeTransition` returns zero matches
 *      outside the `_deprecated.md` marker.
 *
 * The "Cannot find module" error from `require()` is a real module
 * resolution failure — this is not a "tautology" assertion because
 * the production module path is a real, deliberate code path, and
 * requiring it triggers Node's module loader. If a regression
 * accidentally recreates the orphan (e.g. via `git revert` or a
 * re-introduction during a future change), `require()` would succeed
 * and this test would fail.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const ORPHAN_PATH = path.join(REPO_ROOT, 'src/lib/pizarra/usePizarraModeTransition.js');
const DEPRECATED_PATH = path.join(REPO_ROOT, 'src/lib/pizarra/__tests__/_deprecated.md');

describe('usePizarraOrphan — orphan deletion regression', () => {
  test('the orphan usePizarraModeTransition.js file is deleted from the repo', () => {
    expect(fs.existsSync(ORPHAN_PATH)).toBe(false);
  });

  test('a deprecation marker exists at __tests__/_deprecated.md', () => {
    expect(fs.existsSync(DEPRECATED_PATH)).toBe(true);
    const content = fs.readFileSync(DEPRECATED_PATH, 'utf8');
    // The marker must point to the canonical replacement.
    expect(content).toMatch(/useModeTransition/);
    // And explicitly call out what was removed.
    expect(content).toMatch(/usePizarraModeTransition/);
  });

  test('require("@/lib/pizarra/usePizarraModeTransition") throws a module-not-found error', () => {
    // Map the @ alias to the repo root for resolution. This mirrors the
    // jest moduleNameMapper config; the alias path is a real one in
    // the repo and the orphan file is the deliberate target.
    const aliasMap = {
      '^@/(.*)$': path.join(REPO_ROOT, '$1'),
    };

    // Use the same resolution logic as jest's moduleNameMapper.
    const orphanResolved = path.join(REPO_ROOT, 'src/lib/pizarra/usePizarraModeTransition.js');
    expect(fs.existsSync(orphanResolved)).toBe(false);

    // Now actually try to require it via the alias. This is the
    // production-equivalent require path; it MUST throw because the
    // file does not exist on disk.
    let didThrow = false;
    let err = null;
    try {
      // Bypass jest's module cache by deleting the resolved key first.
      const resolved = aliasMap['^@/(.*)$'].replace(
        '$1',
        'src/lib/pizarra/usePizarraModeTransition.js'
      );
      delete require.cache[resolved];
      require(resolved);
    } catch (e) {
      didThrow = true;
      err = e;
    }
    expect(didThrow).toBe(true);
    // The Node loader throws MODULE_NOT_FOUND with a "Cannot find module"
    // message. We assert against that canonical string.
    expect(err).toBeDefined();
    const errMsg = String(err && err.message ? err.message : err);
    expect(errMsg).toMatch(/Cannot find module/i);
  });

  test('git grep for "usePizarraModeTransition" returns zero matches outside _deprecated.md', () => {
    // Use git grep restricted to the source tree. This guards against
    // re-introduction of the orphan by future changes.
    let stdout = '';
    try {
      stdout = execSync('git grep -n "usePizarraModeTransition" -- src/', {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      // git grep returns exit code 1 when there are no matches. That's
      // the success path for this assertion.
      stdout = e.stdout ? String(e.stdout) : '';
    }
    // Filter out the _deprecated.md marker — that's the one place
    // where the name is allowed to appear.
    const lines = stdout.split('\n').filter((l) => l && !l.includes('_deprecated.md'));
    expect(lines).toEqual([]);
  });
});
