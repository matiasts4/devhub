import { execSync } from 'child_process';

/**
 * Parse agent metadata from a process command line (opencode / kimi / codex).
 * @param {string} command
 */
function parseAgentFields(command) {
  const normalizedCommand = String(command || '').replace(/\\n/g, '\n');
  const agentMatch = normalizedCommand.match(/--agent\s+([\w-]+)/);
  const sessionMatch = normalizedCommand.match(/--session\s+([\w-]+)/);
  const workspaceMatch = normalizedCommand.match(/Workspace:\s*([^\r\n]+)/);
  const roleMatch = normalizedCommand.match(/Rol:\s*([^\r\n]+)/);
  // launchId format: launch-<8 hex chars> (see launchSwarmLocal). Do not
  // swallow the role suffix (…-zed / …-sdd_worker_1).
  const launchIdMatch = normalizedCommand.match(/launch-[a-f0-9]{8}\b/i);

  let agent = agentMatch?.[1] || 'unknown';
  if (agent === 'unknown') {
    if (/\bkimi(?:\.exe)?\b/i.test(normalizedCommand)) agent = 'kimi';
    else if (/\bcodex\b/i.test(normalizedCommand)) agent = 'codex';
    else if (/\bopencode\b/i.test(normalizedCommand)) agent = 'opencode';
  }

  return {
    command: normalizedCommand,
    agent,
    role: roleMatch?.[1]?.trim() || null,
    sessionId: sessionMatch?.[1] || null,
    workspace: workspaceMatch?.[1]?.trim() || null,
    launchId: launchIdMatch?.[0] || null,
    startedAt: null,
  };
}

/**
 * Log + attach duplicate-launch warnings (does not mutate input).
 * @param {Array<object>} processes
 */
function finalizeProcessList(processes) {
  console.log(`[SWARM_PROCESSES] Found ${processes.length} agent process(es)`);

  const launchCounts = {};
  processes.forEach((p) => {
    if (p.launchId) {
      launchCounts[p.launchId] = (launchCounts[p.launchId] || 0) + 1;
    }
  });

  const duplicates = Object.entries(launchCounts)
    .filter(([, count]) => count > 5)
    .map(([launchId, count]) => ({ launchId, count }));

  if (duplicates.length > 0) {
    console.warn(`[SWARM_PROCESSES] WARNING: Possible duplicate swarms detected:`, duplicates);
  }

  return processes;
}

/**
 * Unix/macOS: classic `ps aux | grep` scan.
 */
function getOpenCodeProcessesUnix() {
  const output = execSync(
    'ps aux | grep -E "opencode.*--agent|opencode.*--session|kimi.*(--yolo|--prompt|-p )|kimi\\.exe" | grep -v grep',
    { encoding: 'utf8', timeout: 5000 }
  );

  if (!output.trim()) {
    console.log('[SWARM_PROCESSES] No agent processes found');
    return [];
  }

  const processes = output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const pid = parseInt(parts[1], 10);
      const cpu = parseFloat(parts[2]);
      const mem = parseFloat(parts[3]);
      const rss = parseInt(parts[5], 10);
      const command = parts.slice(10).join(' ');
      return {
        pid,
        cpu: Number.isFinite(cpu) ? cpu : 0,
        mem: Number.isFinite(mem) ? mem : 0,
        rss: Number.isFinite(rss) ? rss : 0,
        ...parseAgentFields(command),
      };
    })
    .filter((p) => Number.isFinite(p.pid) && p.pid > 0);

  return finalizeProcessList(processes);
}

/**
 * Windows: scan Win32_Process command lines via PowerShell.
 * `ps` is not available on native Windows hosts.
 */
/**
 * True when a Windows process looks like an agent CLI (not a shell/node that
 * merely mentions "kimi"/"opencode" in an unrelated command line).
 */
function isAgentProcessCandidate(name, command) {
  const n = String(name || '');
  const c = String(command || '');
  if (!c) return false;
  // Drop meta processes (our own scanner / jest / node -e dumps)
  if (/openCodeProcesses|getOpenCodeProcesses|swarm\/processes/i.test(c)) return false;
  if (
    /^[\\/].*[\\/]?(kimi|opencode|codex)(\.exe)?$/i.test(n) ||
    /^(kimi|opencode|codex)(\.exe)?$/i.test(n)
  ) {
    return true;
  }
  // Path-ish invocation: ...\kimi.exe --yolo  or  "C:\...\opencode" --agent
  if (/(^|[\s"'\\/])(kimi|opencode|codex)(\.exe)?([\s"']|$)/i.test(c)) {
    // Require agent-ish flags for node wrappers that embed the binary name.
    if (/\bnode(\.exe)?\b/i.test(c) && !/--agent|--yolo|--session|\bkimi\.exe\b/i.test(c)) {
      return false;
    }
    if (/\bpowershell(\.exe)?\b/i.test(c) && !/kimi\.exe|opencode\.exe/i.test(c)) {
      return false;
    }
    return true;
  }
  return false;
}

function getOpenCodeProcessesWindows() {
  // Newlines keep pipelines valid. Avoid $PID (PowerShell automatic var).
  // Use -EncodedCommand to avoid host quoting hell for nested quotes.
  const psScript = `
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process |
  Where-Object {
    if (-not $_.CommandLine) { return $false }
    $n = [string]$_.Name
    $c = [string]$_.CommandLine
    if ($n -match '^(kimi|opencode|codex)(\\.exe)?$') { return $true }
    if ($c -match '(^|[\\s"''\\\\/])(kimi|opencode|codex)(\\.exe)?([\\s"'']|$)') { return $true }
    return $false
  } |
  ForEach-Object {
    [PSCustomObject]@{
      pid = $_.ProcessId
      name = $_.Name
      command = (($_.CommandLine -replace '[\\r\\n]+',' ').Trim())
    }
  } |
  ConvertTo-Json -Compress
`.trim();

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  const output = execSync(
    `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
    {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    }
  );

  // Strip PowerShell CLIXML progress chatter if it leaked into stdout.
  let trimmed = String(output || '')
    .replace(/#< CLIXML[\s\S]*?<\/Objs>/g, '')
    .trim();
  if (!trimmed) {
    console.log('[SWARM_PROCESSES] No agent processes found (windows)');
    return [];
  }

  // Prefer the JSON object/array region if extra noise remains.
  const jsonStart = Math.min(
    ...['[', '{'].map((ch) => {
      const i = trimmed.indexOf(ch);
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    })
  );
  if (Number.isFinite(jsonStart) && jsonStart > 0) {
    trimmed = trimmed.slice(jsonStart);
  }

  let rows;
  try {
    rows = JSON.parse(trimmed);
  } catch (parseErr) {
    console.error('[SWARM_PROCESSES] Failed to parse Windows process JSON:', parseErr.message);
    return [];
  }

  if (!Array.isArray(rows)) {
    rows = rows ? [rows] : [];
  }

  const processes = rows
    .map((row) => {
      const pid = parseInt(row.pid, 10);
      return {
        pid,
        cpu: 0,
        mem: 0,
        rss: 0,
        name: row.name || null,
        ...parseAgentFields(row.command || ''),
      };
    })
    .filter(
      (p) => Number.isFinite(p.pid) && p.pid > 0 && isAgentProcessCandidate(p.name, p.command)
    );

  return finalizeProcessList(processes);
}

/**
 * List live agent CLI processes used by swarm (opencode / kimi / codex).
 * Platform-aware: uses PowerShell on Windows, ps+grep elsewhere.
 */
export function getOpenCodeProcesses() {
  try {
    if (process.platform === 'win32') {
      return getOpenCodeProcessesWindows();
    }
    return getOpenCodeProcessesUnix();
  } catch (err) {
    // execSync throws when grep finds no matches (exit 1) on Unix — treat as empty.
    const msg = String(err?.message || err || '');
    if (
      /Command failed:|status 1|exit code 1/i.test(msg) &&
      !/ps.*no se reconoce|not recognized/i.test(msg)
    ) {
      console.log('[SWARM_PROCESSES] No agent processes found');
      return [];
    }
    console.error('[SWARM_PROCESSES] Error scanning processes:', err.message);
    return [];
  }
}

/**
 * Check if there's an active swarm for a given project
 * Returns { hasActiveSwarm: boolean, launchId: string|null, agentCount: number }
 */
export function hasActiveSwarmForProject(projectId) {
  try {
    const processes = getOpenCodeProcesses();

    const projectSwarmProcesses = processes.filter(
      (p) => p.workspace?.includes(projectId) || p.command?.includes(projectId)
    );

    return {
      hasActiveSwarm: projectSwarmProcesses.length > 0,
      agentCount: projectSwarmProcesses.length,
      processes: projectSwarmProcesses,
    };
  } catch {
    return { hasActiveSwarm: false, agentCount: 0, processes: [] };
  }
}

// Test helpers (not part of public runtime API, but useful for unit tests)
export const __test__ = {
  parseAgentFields,
  getOpenCodeProcessesUnix,
  getOpenCodeProcessesWindows,
};
