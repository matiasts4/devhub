import fs from 'fs';
import path from 'path';
import os from 'os';
import { PROVIDERS, PROVIDER_LABELS } from '../types.js';

/**
 * Server-side Qoder CLI Quota Adapter.
 *
 * The `qodercli` binary authenticates with a machine-bound token stored
 * encrypted in `~/.qoder/.auth/user`, so we cannot call the quota endpoint
 * ourselves. Instead we read the credit usage the CLI already fetched and
 * logged: while running it polls
 *
 *   GET https://openapi.qoder.sh/api/v2/quota/usage
 *
 * and writes the full JSON response to `~/.qoder/logs/runs/<run>/qodercli.log`
 * on a `[qoderApi] GET ...quota/usage response: {json}` line. We tail the most
 * recent run logs, parse the newest such payload, and surface it as a
 * credits-based ProviderQuotaStatus. Data is therefore as fresh as the last
 * time a Qoder session ran (see `metadata.dataAsOfMs`).
 */

const QUOTA_LINE_RE = /\[qoderApi\]\s+GET\s+\S*quota\/usage\s+response:\s+(\{.*\})\s*$/;
// expiresAt uses a year-9999 sentinel (253402214400000) for "never resets".
const NEVER_RESET_THRESHOLD_MS = 4102444800000; // 2100-01-01
const MAX_TAIL_BYTES = 256 * 1024;
// Many qodercli runs are short-lived and never log a quota response, so scan a
// generous number of recent logs (newest first) to reliably find quota data.
const MAX_LOG_FILES = 60;

function qoderHome() {
  return process.env.QODER_HOME || path.join(os.homedir(), '.qoder');
}

export async function fetchQoderQuota() {
  const result = {
    providerId: PROVIDERS.QODER,
    displayName: PROVIDER_LABELS[PROVIDERS.QODER],
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
    const found = findLatestQuotaPayload();
    if (!found) {
      result.error = 'No Qoder usage data found — run `qodercli` to refresh quota';
      return result;
    }
    result.isAvailable = true;
    result.isAuth = true;
    return applyQoderQuotaPayload(result, found.payload, found.asOfMs);
  } catch (err) {
    result.error = err.message || 'Failed to read Qoder quota';
    return result;
  }
}

/**
 * Maps a raw `/api/v2/quota/usage` payload onto ProviderQuotaStatus.
 * `asOfMs` is the timestamp of the log line the payload came from.
 * Exported for unit testing.
 */
export function applyQoderQuotaPayload(result, payload, asOfMs = null) {
  const planQuota = payload?.userQuota;
  const addOnQuota = payload?.addOnQuota;

  let resetAt = null;
  let resetMs = null;
  let daysUntilRenewal = null;
  const expiresAt = Number(payload?.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < NEVER_RESET_THRESHOLD_MS) {
    resetAt = new Date(expiresAt).toISOString();
    resetMs = Math.max(0, expiresAt - Date.now());
    daysUntilRenewal = Math.max(0, Math.ceil(resetMs / 86_400_000));
  }

  const windows = [];
  if (planQuota) {
    const up = creditUsagePercent(planQuota);
    windows.push(makeWindow('Plan credits', up, resetAt, resetMs));
  }
  if (addOnQuota && Number(addOnQuota.total) > 0) {
    const up = creditUsagePercent(addOnQuota);
    windows.push(makeWindow('Add-on credits', up, null, null));
  }

  // Primary = combined usage the CLI reports, else the worst individual window.
  let primaryUsage;
  const totalPct = toPercent(payload?.totalUsagePercentage);
  if (totalPct !== null) {
    primaryUsage = totalPct;
  } else if (windows.length) {
    primaryUsage = windows.reduce((max, w) => Math.max(max, w.usagePercent), 0);
  } else {
    primaryUsage = 0;
  }

  result.windows = windows;
  result.primaryUsagePercent = Math.round(primaryUsage * 10) / 10;
  result.primaryRemainingPercent = Math.round((100 - primaryUsage) * 10) / 10;
  result.primaryResetAt = resetAt;
  result.timeUntilResetMs = resetMs;
  result.metadata = {
    userType: payload?.userType || null,
    usageType: payload?.usageType || null,
    isQuotaExceeded: payload?.isQuotaExceeded === true,
    upgradeUrl: payload?.upgradeUrl || null,
    unit: planQuota?.unit || 'credits',
    planCredits: planQuota ? creditSummary(planQuota) : null,
    addOnCredits:
      addOnQuota && Number(addOnQuota.total) > 0
        ? { ...creditSummary(addOnQuota), detailUrl: addOnQuota.detailUrl || null }
        : null,
    planExpiresAt: resetAt,
    daysUntilRenewal,
    dataSource: 'cli-log',
    dataAsOfMs: Number.isFinite(asOfMs) ? asOfMs : null,
  };

  if (windows.length === 0) {
    result.error = 'Qoder usage payload contained no quota data';
  }
  return result;
}

/**
 * Credit usage as a 0-100 percentage. The CLI's `percentage` field is a
 * 0..1 fraction, so we prefer computing from used/total and only fall back
 * to the reported fraction.
 */
function creditUsagePercent(quota) {
  const total = Number(quota?.total);
  const used = Number(quota?.used);
  if (Number.isFinite(total) && total > 0 && Number.isFinite(used)) {
    return Math.min(100, Math.max(0, (used / total) * 100));
  }
  return toPercent(quota?.percentage) ?? 0;
}

/** Accepts a 0..1 fraction or a 0..100 percentage; returns 0-100 or null. */
function toPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const pct = n <= 1 ? n * 100 : n;
  return Math.min(100, Math.max(0, pct));
}

function creditSummary(quota) {
  return {
    total: Number(quota?.total) || 0,
    used: Number(quota?.used) || 0,
    remaining: Number(quota?.remaining) || 0,
  };
}

function makeWindow(name, usagePct, resetAt, resetMs) {
  return {
    name,
    usagePercent: Math.round(usagePct * 10) / 10,
    remainingFraction: Math.round((100 - usagePct) * 10) / 1000,
    resetsAt: resetAt,
    timeUntilResetMs: resetMs,
    isExhausted: usagePct >= 100,
  };
}

/**
 * Scans the newest Qoder run logs and returns the freshest quota payload.
 * @returns {{ payload: object, asOfMs: number|null } | null}
 */
function findLatestQuotaPayload() {
  const runsDir = path.join(qoderHome(), 'logs', 'runs');
  let entries;
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const files = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const fp = path.join(runsDir, ent.name, 'qodercli.log');
    try {
      const st = fs.statSync(fp);
      files.push({ fp, mtimeMs: st.mtimeMs });
    } catch {
      // no log in this run dir
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const { fp } of files.slice(0, MAX_LOG_FILES)) {
    const hit = lastQuotaLineIn(fp);
    if (hit) return hit;
  }
  return null;
}

function lastQuotaLineIn(filePath) {
  let text;
  try {
    text = readTail(filePath, MAX_TAIL_BYTES);
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(QUOTA_LINE_RE);
    if (!m) continue;
    try {
      const payload = JSON.parse(m[1]);
      if (payload && typeof payload === 'object') {
        return { payload, asOfMs: parseLineTimestamp(lines[i]) };
      }
    } catch {
      // truncated/partial line — keep scanning older ones
    }
  }
  return null;
}

function readTail(filePath, maxBytes) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    if (len <= 0) return '';
    const buf = new Uint8Array(len);
    fs.readSync(fd, buf, 0, len, start);
    return new TextDecoder('utf8').decode(buf);
  } finally {
    fs.closeSync(fd);
  }
}

function parseLineTimestamp(line) {
  const m = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.+-]+)/);
  if (!m) return null;
  const ms = Date.parse(m[1]);
  return Number.isFinite(ms) ? ms : null;
}
