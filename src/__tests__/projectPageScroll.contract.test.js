const fs = require('fs');
const path = require('path');

describe('project page scroll contracts', () => {
  test('hidden terminal keep-alive forces pointer-events none on all descendants', () => {
    const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
    expect(css).toMatch(/\[data-terminal-container\]\[aria-hidden='true'\]\s*,/);
    expect(css).toMatch(
      /\[data-terminal-container\]\[aria-hidden='true'\]\s+\*\s*\{[\s\S]*pointer-events:\s*none\s*!important/
    );
  });

  test('App wires inert + bounded route scroll for non-terminal pages', () => {
    const app = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
    expect(app).toMatch(
      /inert=\{terminalManagerEverMounted && !isTerminalRoute \? true : undefined\}/
    );
    expect(app).toMatch(/data-testid="project-route-scroll"/);
    expect(app).toMatch(/overflow-y-auto overscroll-contain/);
    expect(app).toMatch(/flex min-h-0 w-full flex-1 flex-col/);
  });

  test('CodeEditor fills the route scrollport so the file tree can scroll internally', () => {
    const editor = fs.readFileSync(path.join(__dirname, '../views/CodeEditor.jsx'), 'utf8');
    expect(editor).toMatch(/flex h-full min-h-0 flex-1 flex-col overflow-hidden/);
    expect(editor).toMatch(/flex min-h-0 w-full flex-1 overflow-hidden/);
  });
});
