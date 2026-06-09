/* eslint-env node, jest */
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  collectSymlinks,
  materializeSymlink,
} = require('../materialize-standalone-runtime.cjs');

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
});