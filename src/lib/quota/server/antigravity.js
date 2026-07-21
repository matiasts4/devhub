import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import https from 'https';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'child_process';
import { PROVIDERS, PROVIDER_LABELS } from '../types.js';

/**
 * Server-side Antigravity (AGY) Quota Adapter.
 *
 * Replicates the onWatch IDE probe against the local Antigravity language
 * server:
 *   1. Find the language_server process (command line contains "antigravity")
 *      and extract its `--csrf_token`.
 *   2. Enumerate the process's listening TCP ports.
 *   3. Probe each port for the Connect RPC endpoint
 *      (`/exa.language_server_pb.LanguageServerService/...`).
 *   4. POST `GetUserStatus` and read per-model `quotaInfo`
 *      (remainingFraction + resetTime) plus plan metadata.
 *
 * No quota numbers are ever fabricated: when the IDE is not running the
 * adapter reports an honest error instead.
 */

const LS_SERVICE = '/exa.language_server_pb.LanguageServerService';
const METADATA_BODY = JSON.stringify({
  metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' },
});

export async function fetchAntigravityQuota() {
  const result = {
    providerId: PROVIDERS.ANTIGRAVITY,
    displayName: PROVIDER_LABELS[PROVIDERS.ANTIGRAVITY],
    isAvailable: false,
    isAuth: false,
    primaryUsagePercent: 0,
    primaryRemainingPercent: 100,
    primaryResetAt: null,
    timeUntilResetMs: null,
    windows: [],
    metadata: {},
    lastUpdatedMs: Date.now(),
    error: null,
  };

  try {
    const agyConfigDir = path.join(os.homedir(), '.gemini', 'antigravity-cli');
    if (!fs.existsSync(agyConfigDir) && !process.env.AGY_PORT) {
      result.error = 'Antigravity CLI configuration not found';
      return result;
    }

    result.isAvailable = true;

    // Manual override path: AGY_PORT (+ AGY_CSRF_TOKEN) skips process detection.
    if (process.env.AGY_PORT) {
      const probe = await fetchUserStatus(
        Number(process.env.AGY_PORT),
        process.env.AGY_CSRF_TOKEN || ''
      );
      if (probe.ok) return applyAntigravityStatus(result, probe.data);
      result.error = probe.error;
      return result;
    }

    const proc = detectAntigravityProcess();
    if (!proc) {
      result.error = 'Antigravity language server process not found (is the AGY IDE/CLI running?)';
      return result;
    }

    const ports = discoverListeningPorts(proc.pid);
    if (ports.length === 0) {
      result.error = 'Antigravity language server has no listening ports';
      return result;
    }

    let lastError = 'Antigravity Connect RPC endpoint not reachable';
    for (const port of ports.slice(0, 8)) {
      const probe = await fetchUserStatus(port, proc.csrfToken);
      if (probe.ok) {
        return applyAntigravityStatus(result, probe.data);
      }
      lastError = probe.error;
    }

    result.error = lastError;
    return result;
  } catch (err) {
    result.error = err.message || 'Failed to fetch AGY quota';
    return result;
  }
}

/**
 * Maps a GetUserStatus payload onto ProviderQuotaStatus.
 * Exported for unit testing.
 */
export function applyAntigravityStatus(result, payload) {
  const userStatus = payload?.userStatus;
  if (!userStatus) {
    result.isAuth = false;
    result.error = payload?.message || 'Antigravity user not authenticated';
    return result;
  }

  result.isAuth = true;

  const configs = userStatus?.cascadeModelConfigData?.clientModelConfigs || [];
  const windows = [];
  let minRemaining = 1.0;
  let earliestResetMs = null;
  let primaryResetAt = null;

  for (const cfg of configs) {
    const quota = cfg?.quotaInfo;
    if (!quota || typeof quota.remainingFraction !== 'number') continue;

    const remFraction = Math.min(1, Math.max(0, quota.remainingFraction));
    const usagePct = Math.round((1 - remFraction) * 100);
    const modelId = cfg?.modelOrAlias?.model || '';
    const label = cleanLabel(cfg.label) || modelId || 'AGY Model';

    let resetMs = null;
    if (quota.resetTime) {
      resetMs = Math.max(0, Date.parse(quota.resetTime) - Date.now());
      if (Number.isFinite(resetMs) && (earliestResetMs === null || resetMs < earliestResetMs)) {
        earliestResetMs = resetMs;
        primaryResetAt = quota.resetTime;
      }
    }

    if (remFraction < minRemaining) minRemaining = remFraction;

    windows.push({
      name: label,
      usagePercent: usagePct,
      remainingFraction: remFraction,
      resetsAt: quota.resetTime || null,
      timeUntilResetMs: Number.isFinite(resetMs) ? resetMs : null,
      isExhausted: remFraction <= 0,
    });
  }

  if (windows.length === 0) {
    result.error = 'Antigravity returned no model quota data';
    return result;
  }

  result.windows = windows;
  result.primaryRemainingPercent = Math.round(minRemaining * 100);
  result.primaryUsagePercent = 100 - result.primaryRemainingPercent;
  result.primaryResetAt = primaryResetAt;
  result.timeUntilResetMs = earliestResetMs;

  const plan = userStatus?.planStatus;
  result.metadata = {
    email: userStatus.email || null,
    planType: plan?.planInfo?.planName || null,
    promptCredits: plan?.availablePromptCredits ?? null,
    monthlyPromptCredits: plan?.planInfo?.monthlyPromptCredits ?? null,
  };

  return result;
}

function cleanLabel(label) {
  if (!label) return '';
  return label.replace(/\s*\(Thinking\)\s*$/, '').trim();
}

/**
 * Finds the Antigravity language server process and its CSRF token.
 * Windows-first (PowerShell CIM), with a `ps aux` fallback for POSIX.
 */
function detectAntigravityProcess() {
  if (process.platform === 'win32') {
    try {
      const psCmd =
        'Get-CimInstance Win32_Process | Where-Object {' +
        ' $_.CommandLine -and ($_.CommandLine -like \'*antigravity*\' -or $_.Name -like \'*language_server*\')' +
        ' } | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json -Compress';
      const out = execFileSync(
        'powershell',
        ['-NoProfile', '-Command', psCmd],
        { encoding: 'utf8', timeout: 15000, windowsHide: true }
      ).trim();
      if (!out) return null;

      let procs = JSON.parse(out);
      if (!Array.isArray(procs)) procs = [procs];

      let best = null;
      let bestScore = -1;
      for (const p of procs) {
        const cmdLine = p.CommandLine || '';
        const name = p.Name || '';
        if (!cmdLine.toLowerCase().includes('antigravity')) continue;
        // Shells/dev tools can mention antigravity in their arguments (or host
        // this very probe) — they are never the language server binary.
        if (/^(bash|sh|zsh|powershell|pwsh|cmd|node|python|code)(64)?\.(exe|bat)$/i.test(name)) continue;
        const isServer =
          /language[_-]server/i.test(name) ||
          /language[_-]server/i.test(cmdLine) ||
          cmdLine.includes('--csrf_token');
        if (!isServer) continue;
        const info = {
          pid: p.ProcessId,
          csrfToken: extractArg(cmdLine, '--csrf_token'),
          port: Number(extractArg(cmdLine, '--extension_server_port')) || 0,
        };
        let score = 0;
        if (info.csrfToken) score += 20;
        if (info.port > 0) score += 10;
        if (/language[_-]server|exa\.language_server_pb/i.test(cmdLine)) score += 50;
        if (score > bestScore) {
          best = info;
          bestScore = score;
        }
      }
      return best;
    } catch (_err) {
      return null;
    }
  }

  try {
    const out = execFileSync('ps', ['aux'], { encoding: 'utf8', timeout: 10000 });
    for (const line of out.split('\n')) {
      const lower = line.toLowerCase();
      if (!lower.includes('antigravity')) continue;
      if (lower.includes('server installation script')) continue;
      if (
        !line.includes('language-server') &&
        !line.includes('--csrf_token') &&
        !line.includes('exa.language_server_pb')
      ) {
        continue;
      }
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[1]);
      if (!pid) continue;
      return {
        pid,
        csrfToken: extractArg(line, '--csrf_token'),
        port: Number(extractArg(line, '--extension_server_port')) || 0,
      };
    }
  } catch (_err) {
    // fall through
  }
  return null;
}

function extractArg(commandLine, argName) {
  const eq = new RegExp(`${argName}=([^\\s"']+|"[^"]*"|'[^']*')`).exec(commandLine);
  if (eq) return eq[1].replace(/^["']|["']$/g, '');
  const sp = new RegExp(`${argName}\\s+([^\\s"']+|"[^"]*"|'[^']*')`).exec(commandLine);
  if (sp) return sp[1].replace(/^["']|["']$/g, '');
  return '';
}

/**
 * Lists LISTENING TCP ports owned by the given PID via netstat.
 */
function discoverListeningPorts(pid) {
  try {
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8', timeout: 15000 });
    const ports = [];
    for (const line of out.split('\n')) {
      if (!line.includes('LISTENING') && !line.includes('LISTEN')) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      if (Number(parts[parts.length - 1]) !== pid) continue;
      const match = /:(\d+)$/.exec(parts[1]);
      if (match) ports.push(Number(match[1]));
    }
    return [...new Set(ports)];
  } catch (_err) {
    return [];
  }
}

/**
 * POSTs GetUserStatus to the language server on a given port.
 * Tries HTTPS first (self-signed certs), then plain HTTP.
 */
async function fetchUserStatus(port, csrfToken) {
  for (const protocol of ['https', 'http']) {
    try {
      const { status, body } = await postConnectRpc(
        protocol,
        port,
        `${LS_SERVICE}/GetUserStatus`,
        METADATA_BODY,
        csrfToken
      );
      if (status === 404 || status === 405) continue; // wrong server on this port
      if (status !== 200) {
        return { ok: false, error: `Antigravity language server HTTP ${status} on port ${port}` };
      }
      const data = JSON.parse(body);
      if (!data?.userStatus) {
        return { ok: false, error: data?.message || 'Antigravity user not authenticated' };
      }
      return { ok: true, data };
    } catch (err) {
      if (protocol === 'https') continue; // retry as http
      return { ok: false, error: `Antigravity probe failed on port ${port}: ${err.message}` };
    }
  }
  return { ok: false, error: `Antigravity Connect RPC not found on port ${port}` };
}

function postConnectRpc(protocol, port, rpcPath, body, csrfToken) {
  return new Promise((resolve, reject) => {
    const mod = protocol === 'https' ? https : http;
    const req = mod.request(
      {
        host: '127.0.0.1',
        port,
        path: rpcPath,
        method: 'POST',
        timeout: 2500,
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/json',
          'Connect-Protocol-Version': '1',
          ...(csrfToken ? { 'X-Codeium-Csrf-Token': csrfToken } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
