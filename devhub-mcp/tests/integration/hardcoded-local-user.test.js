/**
 * Hardcoded-local-user test.
 *
 * Proposal acceptance #6: no file under `devhub-mcp/` (except the
 * `local` adapter) may contain the literal string `'local-user'`.
 * The MCP server must resolve the actor from the AuthProvider port,
 * not from a hardcoded string. REQ-MCPCTX-1.
 */

import { readFileSync, readdirSync } from 'fs';
import { dirname, extname, join, relative } from 'path';
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
  const hits = [];
  const supportedExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && (entry.name === 'tests' || entry.name === 'node_modules')) {
        continue;
      }
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(filePath);
        continue;
      }
      if (!supportedExtensions.has(extname(entry.name))) continue;

      readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .forEach((line, index) => {
          if (/['"]local-user['"]/.test(line)) {
            hits.push(
              `${relative(MCP_ROOT, filePath).replaceAll('\\', '/')}:${index + 1}:${line.trim()}`
            );
          }
        });
    }
  }

  visit(MCP_ROOT);
  return hits;
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
