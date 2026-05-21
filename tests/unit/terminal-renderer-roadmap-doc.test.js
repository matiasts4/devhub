const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('terminal renderer roadmap documentation', () => {
  test('documents current GTK default strategy, xterm fallback, and TERM-04 closure', () => {
    const doc = read('docs/25_Terminal_Renderer_Robusto_Roadmap.md');

    expect(doc).toContain('Terminal renderer robusto');
    expect(doc).toMatch(/GTK\/VTE same-window como renderer nativo por defecto/i);
    expect(doc).toMatch(/xterm.*fallback único/i);
    expect(doc).toMatch(/TERM-04.*cerrado/i);
    expect(doc).toMatch(/Ghostty.*fuera del roadmap activo|Ghostty.*no-go/i);
    expect(doc).toContain('checkpoint/terminal-experiments-2026-05-14');
    expect(doc).toMatch(/no conviene mover esa rama completa/i);
    expect(doc).toContain('Evidence pack');
  });

  test('captures rejected terminal paths and remaining compatibility audit gaps', () => {
    const doc = read('docs/25_Terminal_Renderer_Robusto_Roadmap.md');

    expect(doc).toMatch(/WezTerm\s*\/\s*Alacritty\s*\/\s*Kitty/i);
    expect(doc).toMatch(/overlay \/ child-window|overlay\/child-window/i);
    expect(doc).toMatch(/rechazados como dirección principal/i);
    expect(doc).toMatch(/OpenCode/i);
    expect(doc).toMatch(/Hermes/i);
    expect(doc).toMatch(/Swarm/i);
    expect(doc).toMatch(/un solo runtime terminal activo/i);
    expect(doc).toMatch(/Settings/i);
    expect(doc).toContain('libghostty');
  });
});
