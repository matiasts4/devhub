'use strict';

/**
 * T-016.5 — `devhub swarm logs` CLI command.
 *
 * Reads the per-agent transcript files captured by the T-016.4
 * pipe-pane and prints them (concatenated, or filtered by role) for
 * user review. The transcripts are the durable evidence trail of
 * what each swarm LLM actually said/thought — needed because the
 * /tmp/devhub-swarm-<role>.log only captures wrapper diagnostics.
 *
 * Commands:
 *   devhub swarm logs <launchId>            — concat all roles
 *   devhub swarm logs <launchId> --role X   — only role X
 *   devhub swarm logs <launchId> --list     — list files + sizes
 *
 * Files:
 *   /tmp/devhub-swarm-<role>.transcript
 *   Header (T-016.4):
 *     # DevHub agent transcript
 *     # launch_id: <missionId>
 *     # role: <role>
 *     # started: <iso-timestamp>
 *     # ----
 *
 * The launchId is parsed from the file header (not the filename)
 * because /tmp is shared across all launches and the file name only
 * carries the role.
 */

const fs = require('fs');
const path = require('path');

const HEADER_LAUNCH_LINE = /^# launch_id:\s*(\S+)/m;
const HEADER_ROLE_LINE = /^# role:\s*(\S+)/m;

const DEFAULT_TMP_DIR = '/tmp';
const TRANSCRIPT_GLOB = /^devhub-swarm-(.+)\.transcript$/;

/**
 * Pure function — testable without I/O. Reads transcript files in
 * `tmpDir` (default `/tmp`) and applies launchId + role filters.
 *
 * @param {object} params
 * @param {string} [params.launchId] - filter to this launch; if
 *   undefined, all transcripts are included (used by --list).
 * @param {string} [params.role] - filter to a single role.
 * @param {boolean} [params.list] - if true, return a list of files
 *   with sizes instead of concatenated content.
 * @param {string} [params.tmpDir] - directory to scan (defaults to
 *   /tmp). Used by tests for isolation.
 * @returns {{
 *   kind: 'list' | 'concatenated' | 'role-filtered',
 *   files: Array<{ role: string, path: string, size: number }>,
 *   content: string,
 * }}
 */
function collectSwarmTranscripts({ launchId, role, list = false, tmpDir = DEFAULT_TMP_DIR } = {}) {
  // 1. Enumerate transcript files
  const entries = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : [];
  const transcripts = entries
    .map((name) => {
      const m = name.match(TRANSCRIPT_GLOB);
      if (!m) return null;
      const fileRole = m[1];
      return {
        file: name,
        path: path.join(tmpDir, name),
        role: fileRole,
        size: 0,
        content: '',
        launchId: null,
      };
    })
    .filter(Boolean);

  // 2. Read each file once, parse header
  for (const t of transcripts) {
    let raw = '';
    try {
      raw = fs.readFileSync(t.path, 'utf8');
    } catch {
      // unreadable — skip
      continue;
    }
    t.size = Buffer.byteLength(raw, 'utf8');
    t.content = raw;
    const launchMatch = raw.match(HEADER_LAUNCH_LINE);
    const roleMatch = raw.match(HEADER_ROLE_LINE);
    t.launchId = launchMatch ? launchMatch[1] : null;
    // Prefer the role from the file name (canonical) but fall back to header
    if (roleMatch) t.role = roleMatch[1];
  }

  // 3. Filter by launchId (parsed from header)
  let filtered = transcripts;
  if (launchId) {
    filtered = filtered.filter((t) => t.launchId === launchId);
  }

  // 4. Filter by role
  if (role) {
    filtered = filtered.filter((t) => t.role === role);
  }

  // 5. Sort by role for stable output
  filtered.sort((a, b) => a.role.localeCompare(b.role));

  // 6. Build the return shape
  if (list) {
    return {
      kind: 'list',
      files: filtered.map((t) => ({ role: t.role, path: t.path, size: t.size })),
      content: '',
    };
  }

  if (role) {
    // single role: return the file content as-is
    const only = filtered[0];
    return {
      kind: 'role-filtered',
      files: only ? [{ role: only.role, path: only.path, size: only.size }] : [],
      content: only ? only.content : '',
    };
  }

  // concatenated: prepend a role header to each file
  const blocks = filtered.map(
    (t) => `=== role: ${t.role} ===\n${t.content.replace(/\n$/, '')}\n`
  );
  return {
    kind: 'concatenated',
    files: filtered.map((t) => ({ role: t.role, path: t.path, size: t.size })),
    content: blocks.join('\n'),
  };
}

/**
 * Resolve the most recent launch ID by scanning
 * `/tmp/devhub-injection-<launch>-*.lock` files (the injection locks
 * written by the wrapper, T-004). Used when the user passes
 * `latest` or omits the launchId.
 *
 * @param {string} [tmpDir] - directory to scan (defaults to /tmp)
 * @returns {string|null} the most recent launch_id, or null if none.
 */
function resolveLatestLaunchId(tmpDir = DEFAULT_TMP_DIR) {
  if (!fs.existsSync(tmpDir)) return null;
  const entries = fs.readdirSync(tmpDir);
  const lockFiles = entries
    .filter((name) => /^devhub-injection-.*\.lock$/.test(name))
    .map((name) => {
      const filePath = path.join(tmpDir, name);
      try {
        const stat = fs.statSync(filePath);
        return { name, mtimeMs: stat.mtimeMs, filePath };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (lockFiles.length === 0) return null;
  lockFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
  // File name pattern: devhub-injection-<launch>-<role>.lock
  // Extract launchId (everything between 'devhub-injection-' and the
  // last '-<role>.lock').
  const newest = lockFiles[0].name;
  const m = newest.match(/^devhub-injection-(.+)-.+\.lock$/);
  return m ? m[1] : null;
}

/**
 * `devhub swarm logs` CLI command. Parses opts, calls the pure
 * function, prints the result, and exits.
 *
 * @param {object} opts
 * @param {string} [opts.launchId] - launch to filter; 'latest' or
 *   omitted resolves to the most recent launch.
 * @param {string} [opts.role] - filter to a single role.
 * @param {boolean} [opts.list] - list mode.
 */
function swarmLogsCommand(opts = {}) {
  let launchId = opts.launchId;
  if (!launchId || launchId === 'latest') {
    launchId = resolveLatestLaunchId();
    if (!launchId) {
      process.stderr.write('error: no launches found (no /tmp/devhub-injection-*.lock files)\n');
      process.exit(1);
    }
  }

  const result = collectSwarmTranscripts({ launchId, role: opts.role, list: opts.list });

  if (result.kind === 'list') {
    if (result.files.length === 0) {
      process.stdout.write(`No transcripts found for launch ${launchId}.\n`);
    } else {
      process.stdout.write(`Transcripts for launch ${launchId}:\n`);
      for (const f of result.files) {
        process.stdout.write(`  ${f.role.padEnd(16)} ${f.size} bytes  ${f.path}\n`);
      }
    }
  } else {
    if (!result.content) {
      process.stdout.write(`No transcript content for launch ${launchId}.\n`);
    } else {
      process.stdout.write(result.content);
      if (!result.content.endsWith('\n')) process.stdout.write('\n');
    }
  }
  process.exit(0);
}

module.exports = {
  collectSwarmTranscripts,
  resolveLatestLaunchId,
  swarmLogsCommand,
};
