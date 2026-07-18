/**
 * @jest-environment node
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  pruneJunkTopLevel,
  JUNK_TOP_LEVEL_DIRS,
} = require('../../scripts/build-standalone-zip.cjs');

describe('build-standalone-zip pruneJunkTopLevel', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-standalone-prune-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('junk dir list covers graphify-out / openspec / tmp (zip bloat)', () => {
    expect(JUNK_TOP_LEVEL_DIRS).toEqual(
      expect.arrayContaining(['graphify-out', 'openspec', 'tmp', 'docs', 'sidecar-backend'])
    );
  });

  test('removes junk dirs and keeps runtime roots', () => {
    for (const name of ['graphify-out', 'openspec', 'tmp', 'node_modules', '.next', 'public']) {
      fs.mkdirSync(path.join(tmpRoot, name), { recursive: true });
      fs.writeFileSync(path.join(tmpRoot, name, 'x.txt'), 'x');
    }
    fs.writeFileSync(path.join(tmpRoot, 'AGENTS.md'), 'x');

    pruneJunkTopLevel(tmpRoot);

    expect(fs.existsSync(path.join(tmpRoot, 'graphify-out'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, 'openspec'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, 'tmp'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, 'node_modules'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, '.next'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'public'))).toBe(true);
  });
});
