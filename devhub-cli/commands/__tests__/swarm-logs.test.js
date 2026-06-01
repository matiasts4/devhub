/* eslint-env node, jest */
/**
 * T-016.5 — `devhub swarm logs` CLI command.
 *
 * Spec: openspec/changes/agent-comms-redesign/tasks/T-016.5
 *   - `devhub swarm logs <launch-id>` — concatenates all
 *     /tmp/devhub-swarm-<role>.transcript files for that launch, with
 *     role headers.
 *   - `devhub swarm logs <launch-id> --role <role>` — only that role's
 *     transcript.
 *   - `devhub swarm logs <launch-id> --list` — lists which transcripts
 *     exist (with sizes).
 *
 * Tests reference devhub-cli/commands/swarm-logs.js (NEW). The command
 * is split into:
 *   - collectSwarmTranscripts({ launchId, role, list, tmpDir }) — PURE
 *     function that returns structured data (used by tests).
 *   - swarmLogsCommand(opts) — the CLI wrapper that prints + exits.
 *
 * The pure function is what TDD targets.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-swarm-logs-'));
}

function seedTranscript(dir, launchId, role, content) {
  // The T-016.4 wrapper writes a header block followed by the content.
  // collectSwarmTranscripts parses the header to filter by launch_id.
  const header = [
    '# DevHub agent transcript',
    `# launch_id: ${launchId}`,
    `# role: ${role}`,
    `# started: 2026-06-01T00:00:00+00:00`,
    '# ----',
  ].join('\n');
  const file = path.join(dir, `devhub-swarm-${role}.transcript`);
  fs.writeFileSync(file, `${header}\n${content}`);
  return file;
}

describe('T-016.5: devhub swarm logs — collectSwarmTranscripts pure function', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = makeTmp();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('lists all transcript files for a launch with sizes (--list)', () => {
    // Seed two transcripts (different roles, same launch)
    seedTranscript(tmpDir, 'launch-abc', 'coder', 'agent 1 output\n');
    seedTranscript(tmpDir, 'launch-abc', 'auditor', 'auditor 1 output\n');

    const { collectSwarmTranscripts } = require('../../commands/swarm-logs');
    const result = collectSwarmTranscripts({
      launchId: 'launch-abc',
      list: true,
      tmpDir,
    });

    expect(result.kind).toBe('list');
    expect(result.files).toHaveLength(2);
    // Both files present (order is filesystem-defined; we use SET membership)
    const roles = result.files.map((f) => f.role).sort();
    expect(roles).toEqual(['auditor', 'coder']);
    // Each entry has a size and a path
    for (const f of result.files) {
      expect(f.path).toMatch(/devhub-swarm-.*\.transcript$/);
      expect(typeof f.size).toBe('number');
      expect(f.size).toBeGreaterThan(0);
    }
  });

  test('concatenates all transcript files with role headers when no --role filter', () => {
    seedTranscript(tmpDir, 'launch-abc', 'coder', 'CODER OUTPUT LINE 1\nCODER OUTPUT LINE 2\n');
    seedTranscript(tmpDir, 'launch-abc', 'auditor', 'AUDITOR OUTPUT LINE 1\n');

    const { collectSwarmTranscripts } = require('../../commands/swarm-logs');
    const result = collectSwarmTranscripts({
      launchId: 'launch-abc',
      tmpDir,
    });

    expect(result.kind).toBe('concatenated');
    expect(result.content).toContain('=== role: coder ===');
    expect(result.content).toContain('CODER OUTPUT LINE 1');
    expect(result.content).toContain('CODER OUTPUT LINE 2');
    expect(result.content).toContain('=== role: auditor ===');
    expect(result.content).toContain('AUDITOR OUTPUT LINE 1');
  });

  test('with --role filter, returns only that role\'s content (single file, no role header)', () => {
    seedTranscript(tmpDir, 'launch-abc', 'coder', 'CODER ONLY LINE\n');
    seedTranscript(tmpDir, 'launch-abc', 'auditor', 'AUDITOR ONLY LINE\n');

    const { collectSwarmTranscripts } = require('../../commands/swarm-logs');
    const result = collectSwarmTranscripts({
      launchId: 'launch-abc',
      role: 'coder',
      tmpDir,
    });

    expect(result.kind).toBe('role-filtered');
    expect(result.content).toContain('CODER ONLY LINE');
    expect(result.content).not.toContain('AUDITOR ONLY LINE');
    // The single-role filter should NOT prepend a role header (the file
    // is the canonical record of that one role).
    expect(result.content).not.toMatch(/=== role: coder ===/);
  });

  test('returns empty list / empty content when no transcript files exist for the launch', () => {
    // Seed transcripts for a DIFFERENT launch — they should be ignored
    seedTranscript(tmpDir, 'launch-other', 'coder', 'OTHER LAUNCH\n');

    const { collectSwarmTranscripts } = require('../../commands/swarm-logs');
    const listResult = collectSwarmTranscripts({
      launchId: 'launch-abc',
      list: true,
      tmpDir,
    });
    expect(listResult.kind).toBe('list');
    expect(listResult.files).toEqual([]);

    const concatResult = collectSwarmTranscripts({
      launchId: 'launch-abc',
      tmpDir,
    });
    expect(concatResult.kind).toBe('concatenated');
    expect(concatResult.content).toBe('');
  });
});

describe('T-016.5: devhub swarm logs — resolveLatestLaunchId', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = makeTmp();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns the launchId from the most recently modified /tmp/devhub-injection-<launch>-*.lock file', async () => {
    // Seed two lock files with different mtimes
    const oldLock = path.join(tmpDir, 'devhub-injection-launch-old-coder.lock');
    const newLock = path.join(tmpDir, 'devhub-injection-launch-new-coder.lock');
    fs.writeFileSync(oldLock, JSON.stringify({ launch_id: 'launch-old', role: 'coder' }));
    fs.writeFileSync(newLock, JSON.stringify({ launch_id: 'launch-new', role: 'coder' }));
    // Set the old lock to 1 hour ago, the new lock to now
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    fs.utimesSync(oldLock, oneHourAgo, oneHourAgo);
    // newLock stays at "now" (just created)

    const { resolveLatestLaunchId } = require('../../commands/swarm-logs');
    // resolveLatestLaunchId is synchronous; it uses fs.statSync to read mtime
    // Sleep briefly to ensure mtimes differ on filesystems with second precision
    await new Promise((resolve) => setTimeout(resolve, 50));
    fs.utimesSync(oldLock, oneHourAgo, oneHourAgo);
    const result = resolveLatestLaunchId(tmpDir);
    expect(result).toBe('launch-new');
  });

  test('returns null when no injection lock files exist in the directory', () => {
    const { resolveLatestLaunchId } = require('../../commands/swarm-logs');
    expect(resolveLatestLaunchId(tmpDir)).toBeNull();
  });
});
