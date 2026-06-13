const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('TERM-01 terminal evidence pack documentation', () => {
  test('documents reproducible protocols for dev web, tauri dev, and installed app checks', () => {
    const doc = read('docs/26_TERM-01_Terminal_Renderer_Evidence_Pack.md');

    expect(doc).toContain('TERM-01');
    expect(doc).toMatch(/dev web/i);
    expect(doc).toMatch(/tauri dev/i);
    expect(doc).toMatch(/installed app/i);
    expect(doc).toMatch(/close all DevHub instances first/i);
    expect(doc).toMatch(/terminal-debug\.log/i);
  });

  test('records xterm-webgl as the new default and xterm as the baseline fallback', () => {
    const doc = read('docs/26_TERM-01_Terminal_Renderer_Evidence_Pack.md');

    // New policy (2026-06-07): xterm-webgl is the default; xterm (DOM) is the
    // baseline and the explicit fallback when xterm-webgl is unavailable.
    expect(doc).toMatch(/xterm-webgl is the default renderer/i);
    expect(doc).toMatch(/xterm.*baseline.*fallback|baseline.*xterm.*fallback/is);
    expect(doc).toMatch(/fallback/i);
    expect(doc).toMatch(/vte-experimental.*opt-in|GTK\/VTE.*opt-in/i);
    expect(doc).toMatch(/soft roll-out/i);
    expect(doc).toContain('checkpoint/terminal-experiments-2026-05-14');
    expect(doc).toMatch(/reference material only/i);
  });
});
