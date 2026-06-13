const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  collectSymlinks,
  discoverHashedExternalPackages,
  ensureHashedExternalPackages,
  materializeSymlink,
  NESTED_NODE_MODULES,
} = require('../../scripts/materialize-standalone-runtime.cjs');

describe('materialize-standalone-runtime', () => {
  test('materializeSymlink replaces symlink with real directory contents', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-materialize-'));
    const realDir = path.join(root, 'real');
    const linkDir = path.join(root, 'linked');
    fs.mkdirSync(realDir);
    fs.writeFileSync(path.join(realDir, 'index.js'), 'module.exports = 1;\n');
    fs.symlinkSync(path.join('real'), linkDir);

    materializeSymlink(linkDir);

    expect(fs.lstatSync(linkDir).isDirectory()).toBe(true);
    expect(fs.lstatSync(linkDir).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(linkDir, 'index.js'), 'utf8')).toContain('module.exports');
    expect(collectSymlinks(linkDir)).toHaveLength(0);
  });

  test('discoverHashedExternalPackages finds better-sqlite3 hash ids in server chunks', () => {
    const hashedNames = discoverHashedExternalPackages();
    expect(hashedNames).toEqual(expect.arrayContaining(['better-sqlite3-cf218e5bd1d5f04c']));
  });

  test('ensureHashedExternalPackages materializes hashed better-sqlite3 under .next/node_modules', () => {
    const hashedNames = ensureHashedExternalPackages();
    expect(hashedNames).toEqual(expect.arrayContaining(['better-sqlite3-cf218e5bd1d5f04c']));

    const nativeBinding = path.join(
      NESTED_NODE_MODULES,
      'better-sqlite3-cf218e5bd1d5f04c',
      'build',
      'Release',
      'better_sqlite3.node'
    );
    expect(fs.existsSync(nativeBinding)).toBe(true);
    expect(
      collectSymlinks(path.join(NESTED_NODE_MODULES, 'better-sqlite3-cf218e5bd1d5f04c'))
    ).toHaveLength(0);
  });
});
