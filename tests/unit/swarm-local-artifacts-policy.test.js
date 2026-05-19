const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('política de artefactos locales del swarm', () => {
  test('gitignore marca .claude, .plyrium-forge y opencode.json como artefactos tool-local', () => {
    const gitignore = read('.gitignore');

    expect(gitignore).toContain('.claude/');
    expect(gitignore).toContain('.plyrium-forge/');
    expect(gitignore).toContain('opencode.json');
  });

  test('la doc fija que docs/swarm-control se versiona y que los artefactos locales no son source of truth', () => {
    const doc = read('docs/swarm-control/SW-8.1B-higiene-jest-y-artefactos-locales.md');

    expect(doc).toContain('docs/swarm-control/ se conserva y se versiona');
    expect(doc).toContain('.claude/ es tool-local y no se commitea');
    expect(doc).toContain('.plyrium-forge/ es tool-local y no se commitea');
    expect(doc).toContain('opencode.json es config local de runtime y no source of truth');
    expect(doc).toContain('Jest debe ignorar .plyrium-forge/worktrees/');
  });
});
