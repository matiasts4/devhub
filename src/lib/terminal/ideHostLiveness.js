/**
 * ideHostLiveness — detect whether the Antigravity IDE/CLI host process is
 * alive on this machine.
 *
 * Redundancy tier 3 (after hooks and transcript quiescence): IDE-embedded
 * agents are invisible to per-panel PTY scraping and may not have hooks
 * installed; knowing the host app is running at all lets DevHub keep an
 * 'agy-ide' virtual session warm instead of reporting a false "finished".
 * Pattern ported from open-vibe-island (#510: tie liveness to the HOST
 * process, not the agent subprocess).
 *
 * All commands use FIXED argument arrays (no string interpolation of
 * user-controlled data → no shell injection surface). The exec
 * implementation is injectable for tests.
 */

import { execFile } from 'child_process';

/** Process name patterns identifying Antigravity host binaries. */
const ANTIGRAVITY_HOST_RE = /antigravity|(?<![a-z])agy(?![a-z])/i;

/** Language-server / helper process patterns (Go binary, MCP helpers). */
const ANTIGRAVITY_LS_RE = /antigravity[-_ ]?(?:language[-_ ]?server|ls|lsp)|agy[-_ ]?ls/i;

function defaultExec(command, args, options) {
  return new Promise((resolve) => {
    execFile(command, args, { ...options, timeout: 3000, windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve({ ok: false, stdout: '' });
      } else {
        resolve({ ok: true, stdout: stdout || '' });
      }
    });
  });
}

/**
 * Parse Windows `tasklist /FO CSV /NH` output into [{name, pid}].
 */
function parseTasklistCsv(stdout) {
  const processes = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    // "Image Name","PID","Session Name","Session#","Mem Usage"
    const match = line.match(/^"([^"]+)","(\d+)"/);
    if (match) {
      processes.push({ name: match[1], pid: Number(match[2]) });
    }
  }
  return processes;
}

/**
 * Parse Unix `ps -axo pid=,command=` output into [{name, pid, command}].
 */
function parsePsOutput(stdout) {
  const processes = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      const command = match[2];
      // name = basename of the binary (first token of the command line).
      const binary = command.split(/\s+/)[0] || command;
      const name = binary.split(/[/\\]/).pop() || binary;
      processes.push({ name, pid: Number(match[1]), command });
    }
  }
  return processes;
}

/**
 * Check whether any Antigravity host process (IDE, terminal agent, or CLI)
 * is currently running.
 *
 * @param {{ exec?: Function, platform?: string }} [deps] — injectable for tests
 * @returns {Promise<{ running: boolean, pids: number[] }>}
 */
export async function isAntigravityHostRunning(deps = {}) {
  const exec = deps.exec || defaultExec;
  const platform = deps.platform || process.platform;

  try {
    if (platform === 'win32') {
      const { ok, stdout } = await exec('tasklist', ['/FO', 'CSV', '/NH'], {});
      if (!ok) return { running: false, pids: [] };
      const pids = parseTasklistCsv(stdout)
        .filter((p) => ANTIGRAVITY_HOST_RE.test(p.name))
        .map((p) => p.pid);
      return { running: pids.length > 0, pids };
    }

    const { ok, stdout } = await exec('ps', ['-axo', 'pid=,command='], {});
    if (!ok) return { running: false, pids: [] };
    const pids = parsePsOutput(stdout)
      .filter((p) => ANTIGRAVITY_HOST_RE.test(p.command))
      .map((p) => p.pid);
    return { running: pids.length > 0, pids };
  } catch {
    return { running: false, pids: [] };
  }
}

/**
 * List running Antigravity language-server / LSP helper processes.
 * (Local Go binary exposing the IDE's agent API — see audit §5.3.)
 *
 * @param {{ exec?: Function, platform?: string }} [deps] — injectable for tests
 * @returns {Promise<Array<{ name: string, pid: number, command?: string }>>}
 */
export async function listAntigravityLanguageServers(deps = {}) {
  const exec = deps.exec || defaultExec;
  const platform = deps.platform || process.platform;

  try {
    if (platform === 'win32') {
      const { ok, stdout } = await exec('tasklist', ['/FO', 'CSV', '/NH'], {});
      if (!ok) return [];
      return parseTasklistCsv(stdout)
        .filter((p) => ANTIGRAVITY_LS_RE.test(p.name))
        .map((p) => ({ name: p.name, pid: p.pid }));
    }

    const { ok, stdout } = await exec('ps', ['-axo', 'pid=,command='], {});
    if (!ok) return [];
    return parsePsOutput(stdout).filter((p) => ANTIGRAVITY_LS_RE.test(p.command));
  } catch {
    return [];
  }
}

// Exported for tests.
export const __testables = { parseTasklistCsv, parsePsOutput, ANTIGRAVITY_HOST_RE };
