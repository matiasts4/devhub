#!/usr/bin/env node
/**
 * ZEB-005 namespace enforcement: no source file outside the dedicated
 * `zedOpen*Event` helpers is allowed to construct a
 * `devhub:zed-*` CustomEvent inline. This script globs `src/`
 * for the offending pattern and fails (exit 1) if any matches are
 * found outside the allow-list.
 *
 * Pattern matches the call shape we forbid:
 *   window.dispatchEvent(new CustomEvent('devhub:zed-...', ...))
 *
 * Allow-list (the only allowed sites for inline dispatch):
 *   - src/components/zedOpenTerminalEvent.js
 *   - src/components/zedOpenUrlEvent.js
 *
 * Run via: `node tests/spec/zed-event-bus-namespace.test.mjs`
 * (or through `pnpm test`, since the runner globs `tests/spec/`).
 *
 * Exits 0 on success, 1 on any violation. Reports each violation
 * as `<file>:<line>  <line-content>` so the maintainer can fix it.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO_ROOT = process.cwd();
const SEARCH_ROOTS = ['src/components', 'src/lib', 'src/app'];
const ALLOW_LIST = new Set([
  ['src', 'components', 'zedOpenTerminalEvent.js'].join(sep),
  ['src', 'components', 'zedOpenUrlEvent.js'].join(sep),
]);
const FORBIDDEN_PATTERN =
  /window\.dispatchEvent\(\s*new\s+CustomEvent\(\s*['"]devhub:zed-/;

const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const IGNORE_DIRS = new Set(['node_modules', '.next', '__snapshots__']);

/** Recursively walk a directory and yield relative file paths. */
async function* walk(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      yield* walk(join(root, entry.name));
    } else if (entry.isFile()) {
      const dotIdx = entry.name.lastIndexOf('.');
      const ext = dotIdx >= 0 ? entry.name.slice(dotIdx) : '';
      if (SOURCE_EXTS.has(ext)) yield join(root, entry.name);
    }
  }
}

function lineNumber(content, index) {
  let count = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) count += 1;
  }
  return count;
}

test('ZEB-005: no inline devhub:zed-* dispatch outside helpers', async () => {
  const violations = [];

  for (const root of SEARCH_ROOTS) {
    const absRoot = join(REPO_ROOT, root);
    let rootStat;
    try {
      rootStat = await stat(absRoot);
    } catch {
      continue;
    }
    if (!rootStat.isDirectory()) continue;

    for await (const absFile of walk(absRoot)) {
      const rel = relative(REPO_ROOT, absFile);
      if (ALLOW_LIST.has(rel)) continue;
      const text = await readFile(absFile, 'utf8');
      const matches = [...text.matchAll(new RegExp(FORBIDDEN_PATTERN, 'g'))];
      for (const m of matches) {
        const lineNo = lineNumber(text, m.index);
        const lineText = text.slice(
          text.lastIndexOf('\n', m.index) + 1,
          text.indexOf('\n', m.index) === -1 ? text.length : text.indexOf('\n', m.index)
        ).trim();
        violations.push({ file: rel, line: lineNo, text: lineText });
      }
    }
  }

  if (violations.length > 0) {
    const report = violations
      .map((v) => `  ${v.file}:${v.line}  ${v.text}`)
      .join('\n');
    assert.fail(
      `Found ${violations.length} inline dispatch site(s) for \`devhub:zed-*\` outside the helpers:\n${report}\n\n` +
        `All dispatches MUST go through \`dispatchZedOpenTerminal\` (in src/components/zedOpenTerminalEvent.js) ` +
        `or \`dispatchZedOpenUrl\` (in src/components/zedOpenUrlEvent.js).`
    );
  }
});
