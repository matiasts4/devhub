const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('project context snapshot docs', () => {
  test('PROJECT_CONTEXT defines precedence, current swarm state, and continuity rule', () => {
    const doc = read('docs/PROJECT_CONTEXT.md');

    expect(doc).toContain('# PROJECT_CONTEXT');
    expect(doc).toContain('Derived snapshot');
    expect(doc).toContain('DevHub tasks/comments/milestones');
    expect(doc).toContain('Engram');
    expect(doc).toContain('canonical docs');
    expect(doc).toContain('PROJECT_CONTEXT');
    expect(doc).toContain('Fase 13 — Swarm Workspace');
    expect(doc).toContain('SW-0.1');
    expect(doc).toContain('SW-0.2');
    expect(doc).toContain('SW-1.1');
    expect(doc).toContain('SW-1.2');
    expect(doc).toContain('SW-1.3');
    expect(doc).toContain('SW-2.1');
    expect(doc).toContain('SW-2.2');
    expect(doc).toContain('SW-3.1');
    expect(doc).toContain('SW-4.1');
    expect(doc).toMatch(/out-of-plan|fuera de plan/i);
    expect(doc).toMatch(/mirror|espejar/i);
  });

  test('master guide points readers to PROJECT_CONTEXT as entry snapshot', () => {
    const guide = read('docs/00_Guia_Maestra.md');

    expect(guide).toContain('PROJECT_CONTEXT');
    expect(guide).toMatch(/snapshot|contexto/i);
  });
});
