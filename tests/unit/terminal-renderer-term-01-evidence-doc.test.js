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

  test('records xterm as the baseline fallback and experimental branch as reference-only', () => {
    const doc = read('docs/26_TERM-01_Terminal_Renderer_Evidence_Pack.md');

    expect(doc).toMatch(/xterm remains the baseline/i);
    expect(doc).toMatch(/fallback/i);
    expect(doc).toContain('checkpoint/terminal-experiments-2026-05-14');
    expect(doc).toMatch(/reference material only/i);
  });
});
