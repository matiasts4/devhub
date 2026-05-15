const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('terminal renderer roadmap documentation', () => {
  test('documents branch reuse boundary, fallback, and evidence-first rollout', () => {
    const doc = read('docs/25_Terminal_Renderer_Robusto_Roadmap.md');

    expect(doc).toContain('Terminal renderer robusto');
    expect(doc).toContain('checkpoint/terminal-experiments-2026-05-14');
    expect(doc).toMatch(/no conviene mover esa rama completa/i);
    expect(doc).toMatch(/cantera de diseño/i);
    expect(doc).toContain('TERM-0');
    expect(doc).toContain('Evidence pack');
    expect(doc).toContain('xterm');
    expect(doc).toMatch(/fallback/i);
    expect(doc).toMatch(/switch/i);
    expect(doc).toMatch(/same-window/i);
  });

  test('ranks in-app renderer options and rejects external terminals as primary path', () => {
    const doc = read('docs/25_Terminal_Renderer_Robusto_Roadmap.md');

    expect(doc).toContain('Opciones de renderer');
    expect(doc).toMatch(/mejor a peor/i);
    expect(doc).toMatch(/dentro de la app/i);
    expect(doc).toContain('GTK VTE Linux');
    expect(doc).toContain('libghostty');
    expect(doc).toContain('Ghostty');
    expect(doc).toMatch(/WezTerm\/Alacritty\/Kitty/);
    expect(doc).toMatch(/Rechazada como dirección principal/i);
    expect(doc).toMatch(/GTK VTE Linux in-app/);
    expect(doc).toMatch(/libghostty.*in-app/i);
  });
});
