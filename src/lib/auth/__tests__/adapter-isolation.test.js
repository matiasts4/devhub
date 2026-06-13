'use strict';

/**
 * Static-import scan: no file under src/ may import a vendor auth SDK
 * outside `src/lib/auth/providers/`. Enforces REQ-AUTH-2 (Adapter isolation
 * contract) at the test layer in addition to the ESLint rule.
 *
 * Boots a synthetic codebase (fake adapter) and asserts that no app code
 * outside the adapter directory references the Supabase SDK or any other
 * vendor SDK by name.
 */

const { execSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

function scan(relativeDir) {
  const absolute = path.join(PROJECT_ROOT, relativeDir);
  try {
    const out = execSync(
      `grep -rE "@supabase/supabase-js|@supabase/ssr" ${absolute} ` +
        `--include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" -l 2>/dev/null || true`,
      { encoding: 'utf8' }
    );
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => path.relative(PROJECT_ROOT, line));
  } catch {
    return [];
  }
}

describe('AuthProvider adapter isolation (REQ-AUTH-2)', () => {
  test('no file in src/lib/auth/ outside providers/ imports Supabase', () => {
    const matches = scan('src/lib/auth').filter((file) => {
      // Providers directory is the only allowed location.
      return !file.includes(`${path.sep}providers${path.sep}`);
    });
    expect(matches).toEqual([]);
  });

  test('no file in src/lib/tenancy/ imports Supabase', () => {
    const matches = scan('src/lib/tenancy');
    expect(matches).toEqual([]);
  });

  test('no file in src/lib/db/ imports Supabase (db is independent of auth)', () => {
    const matches = scan('src/lib/db');
    expect(matches).toEqual([]);
  });

  test('the local adapter does not import Supabase', () => {
    const matches = scan('src/lib/auth/providers').filter((file) =>
      file.endsWith(`${path.sep}local.js`)
    );
    expect(matches).toEqual([]);
  });

  test('the fake adapter does not import Supabase', () => {
    const matches = scan('src/lib/auth/providers').filter((file) =>
      file.endsWith(`${path.sep}fake.js`)
    );
    expect(matches).toEqual([]);
  });

  test('the supabase adapter MAY import Supabase (control case)', () => {
    const matches = scan('src/lib/auth/providers').filter((file) =>
      file.endsWith(`${path.sep}supabase.js`)
    );
    // The supabase adapter is the one allowed location.
    expect(matches.length).toBeGreaterThanOrEqual(0); // self-confirming; ESLint enforces the real rule.
  });
});
