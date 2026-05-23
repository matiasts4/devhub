'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const pkg = require('./package.json');

const CLI = path.resolve(__dirname, 'bin', 'devhub');

// ── CLI Exit Code Tests ──────────────────────────────────────────

describe('CLI --help', () => {
  it('exits 0 and stdout contains command list', () => {
    const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Commands?/i);
  });
});

describe('CLI --version', () => {
  it('exits 0 and stdout contains version from package.json', () => {
    const result = spawnSync('node', [CLI, '--version'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(pkg.version);
  });
});

describe('CLI unknown command', () => {
  it('exits 2 for unrecognized command', () => {
    const result = spawnSync('node', [CLI, 'nonexistent'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
  });
});

describe('CLI stub commands', () => {
  it.each(['swarm', 'task', 'ws', 'run'])('exits 1 and stderr has "not yet implemented" for %s', (cmd) => {
    const result = spawnSync('node', [CLI, cmd], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not yet implemented/i);
  });
});

// ── Formatter Tests ──────────────────────────────────────────────

describe('lib/format.js', () => {
  let formatModule;

  describe('colorize when not TTY', () => {
    it('strips ANSI escape sequences', () => {
      jest.resetModules();
      // Ensure isTTY is falsy (default in Jest)
      process.stdout.isTTY = undefined;
      formatModule = require('./lib/format.js');

      const result = formatModule.colorize('hello', 31);
      expect(result).not.toContain('\x1b[');
      expect(result).toBe('hello');
    });
  });

  describe('colorize when TTY', () => {
    it('includes ANSI escape codes', () => {
      jest.resetModules();
      process.stdout.isTTY = true;
      formatModule = require('./lib/format.js');

      try {
        const result = formatModule.colorize('hello', 31);
        expect(result).toContain('\x1b[');
        expect(result).toContain('hello');
      } finally {
        process.stdout.isTTY = undefined;
      }
    });
  });

  describe('compactOutput', () => {
    it('returns text as string', () => {
      formatModule = require('./lib/format.js');
      expect(formatModule.compactOutput(42)).toBe('42');
      expect(formatModule.compactOutput('hello')).toBe('hello');
    });
  });
});

// ── Shared Core Re-Export Tests ──────────────────────────────────

describe('lib/db.js barrel', () => {
  it('re-exports all 7 functions from compactReads.js', () => {
    const db = require('./lib/db.js');
    expect(typeof db.readExecutionQueueSummary).toBe('function');
    expect(typeof db.readWorkspaceEvidenceSummary).toBe('function');
    expect(typeof db.readAgentRegistrySummary).toBe('function');
    expect(typeof db.heartbeatLabel).toBe('function');
    expect(typeof db.presentExecutionQueue).toBe('function');
    expect(typeof db.presentWorkspaceEvidence).toBe('function');
    expect(typeof db.createDirectorQueueContract).toBe('function');
  });
});
