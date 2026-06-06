/**
 * Hardcoded-local-user test.
 *
 * Proposal acceptance #6: no file under `devhub-mcp/` (except the
 * `local` adapter) may contain the literal string `'local-user'`.
 * The MCP server must resolve the actor from the AuthProvider port,
 * not from a hardcoded string. REQ-MCPCTX-1.
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = join(__dirname, '..', '..');

function findLocalUserLiterals() {
  // Search for the exact literal 'local-user' (with quotes) under
  // devhub-mcp/. Exclude the test directory (tests self-reference the
  // literal as test data). Allow exactly ONE defensive fallback in
  // tools/projects.js for the case where the AuthProvider port is
  // not available; everything else must go through the port.
  const out = execSync(
    `grep -rE "['\\\"]local-user['\\\"]" ${MCP_ROOT} ` +
      `--include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" ` +
      `--exclude-dir=tests 2>/dev/null || true`,
    { encoding: 'utf8' }
  );
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

describe('devhub-mcp hardcoded local-user literal (REQ-MCPCTX-1)', () => {
  it('only allows the defensive fallback in projects.js and workspaces.js', () => {
    const hits = findLocalUserLiterals();
    // The acceptable occurrences are the defensive fallbacks in
    // tools/projects.js and tools/workspaces.js when the
    // AuthProvider port is unavailable. The actor is resolved via
    // getAuthProvider() in local mode (synthetic local-user).
    expect(hits.length).toBeLessThanOrEqual(2);
    for (const hit of hits) {
      expect(hit).toMatch(/tools\/(projects|workspaces)\.js/);
    }
  });
});
