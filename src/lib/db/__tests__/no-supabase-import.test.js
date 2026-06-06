'use strict';

/**
 * Adapter isolation test for the postgres-generic driver.
 *
 * Per REQ-PGD-2, the `pg` package may only be imported from
 * `src/lib/db/postgres-generic.js` (or the equivalent .ts file). No
 * other file under `src/` may import it. The AuthProvider (CAP-1) may
 * use Supabase, but the DB driver is independent.
 */

const { execSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

function scan(relativeDir, pattern = 'pg') {
  const absolute = path.join(PROJECT_ROOT, relativeDir);
  try {
    const out = execSync(
      /* eslint-disable no-useless-escape */
      `grep -rE "['\\\"]${pattern}['\\\"]" ${absolute} ` +
        `--include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" ` +
        `--exclude-dir=__tests__ --exclude-dir=node_modules 2>/dev/null || true`,
      /* eslint-enable no-useless-escape */
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

describe('postgres-generic driver adapter isolation (REQ-PGD-2)', () => {
  test('no file under src/ outside postgres-generic.js imports the pg package directly', () => {
    // We need to allow `postgres-generic.js` itself. Everything else is
    // a violation.
    const allowed = new Set(['src/lib/db/postgres-generic.js']);
    const hits = scan('src').filter((file) => !allowed.has(file));
    expect(hits).toEqual([]);
  });

  // RED for task 4.5: also assert no @supabase import leaks into the postgres-generic driver (REQ-PGD-2)
  test('postgres-generic driver file itself contains no supabase import (adapter isolation)', () => {
    const absolute = require('path').join(
      require('path').resolve(__dirname, '../../..'),
      'src/lib/db/postgres-generic.js'
    );
    const { execSync } = require('child_process');
    const out = execSync(`grep -rE "@supabase" ${absolute} --include="*.js" 2>/dev/null || true`, {
      encoding: 'utf8',
    });
    const hits = out.split('\n').filter(Boolean);
    // if the driver file had @supabase require, hits not empty -> fail (RED until removed)
    expect(hits).toEqual([]);
  });
});
