/**
 * OpenSpec change folder contract for `terminal-renderer-default-xterm-webgl`.
 *
 * Verifies the change folder has the required proposal + 3 spec folders
 * so the change can be archived after apply.
 *
 * Specs: openspec/changes/terminal-renderer-default-xterm-webgl/specs/
 *   - terminal-renderer-default/spec.md
 *   - terminal-renderer-selection/spec.md
 *   - terminal-renderer-fallback/spec.md
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const changeRoot = path.join(repoRoot, 'openspec/changes/terminal-renderer-default-xterm-webgl');

describe('openspec change folder — terminal-renderer-default-xterm-webgl', () => {
  test('holds a proposal.md with intent, scope, and approach sections', () => {
    const proposalPath = path.join(changeRoot, 'proposal.md');
    expect(fs.existsSync(proposalPath)).toBe(true);

    const proposal = fs.readFileSync(proposalPath, 'utf8');
    expect(proposal).toMatch(/## Intent/i);
    expect(proposal).toMatch(/## Scope/i);
    expect(proposal).toMatch(/### In Scope/i);
    expect(proposal).toMatch(/### Out of Scope/i);
    expect(proposal).toMatch(/## Approach/i);
    expect(proposal).toMatch(/## Migration/i);
  });

  test('holds a tasks.md with phases and hierarchical task numbers', () => {
    const tasksPath = path.join(changeRoot, 'tasks.md');
    expect(fs.existsSync(tasksPath)).toBe(true);

    const tasks = fs.readFileSync(tasksPath, 'utf8');
    expect(tasks).toMatch(/^## Phase 1:/m);
    expect(tasks).toMatch(/^## Phase 2:/m);
    expect(tasks).toMatch(/^## Phase 3:/m);
    expect(tasks).toMatch(/^## Phase 4:/m);
    expect(tasks).toMatch(/^## Phase 5:/m);
    expect(tasks).toMatch(/^## Phase 6:/m);
    expect(tasks).toMatch(/^## Phase 7:/m);
  });

  test('holds three delta spec folders: terminal-renderer-default, terminal-renderer-selection, terminal-renderer-fallback', () => {
    const expectedSpecFolders = [
      'terminal-renderer-default',
      'terminal-renderer-selection',
      'terminal-renderer-fallback',
    ];

    for (const folder of expectedSpecFolders) {
      const specPath = path.join(changeRoot, 'specs', folder, 'spec.md');
      expect(fs.existsSync(specPath)).toBe(true);

      const spec = fs.readFileSync(specPath, 'utf8');
      // Each delta spec must declare its purpose and at least one requirement.
      expect(spec).toMatch(/## Purpose|## Type:\s*DELTA/i);
      expect(spec).toMatch(/## Requirements|## ADDED Requirements/i);
    }
  });
});
