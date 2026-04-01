import { NextResponse } from 'next/server';
import { getAvailableProfiles, getProfileHome } from '@/utils/geminiProfiles';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);
const QUOTA_RESET_REGEX = /quota will reset after\s+([^\.\n]+)\./i;
const GQUOTA_LINE_REGEX = /`([^`]+)`:\s+(\*\*)?([0-9]+(?:\.[0-9]+)?)%\s+used(\*\*)?\s+[\u2014-]\s+resets in\s+([^\n]+)/gi;

function extractJsonBlock(rawOutput) {
  if (!rawOutput) return null;

  const start = rawOutput.indexOf('{');
  const end = rawOutput.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  const maybeJson = rawOutput.slice(start, end + 1);
  try {
    return JSON.parse(maybeJson);
  } catch {
    return null;
  }
}

function parseQuotaState(output) {
  const exhausted = /exhausted your capacity on this model/i.test(output);
  const resetMatch = output.match(QUOTA_RESET_REGEX);
  const resetIn = resetMatch ? resetMatch[1].trim() : null;

  return {
    exhausted,
    resetIn,
  };
}

function parseGquotaModels(output) {
  const models = [];
  if (!output) return models;

  let match;
  while ((match = GQUOTA_LINE_REGEX.exec(output)) !== null) {
    models.push({
      model: match[1],
      usedPercent: Number(match[3]),
      resetIn: match[5].trim(),
    });
  }

  return models;
}

async function fetchOpenCodeProfileQuota(homePath) {
  const command = 'opencode run "/gquota"';

  try {
    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, GEMINI_CLI_HOME: homePath },
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });

    const output = `${stdout || ''}\n${stderr || ''}`;
    const models = parseGquotaModels(output);

    if (!models.length) {
      return {
        status: 'unknown',
        source: 'opencode:/gquota',
        quotaUsedPercent: null,
        resetIn: null,
        models: [],
      };
    }

    const mostUsed = models.reduce((best, current) =>
      current.usedPercent > best.usedPercent ? current : best
    );

    return {
      status: mostUsed.usedPercent >= 100 ? 'exhausted' : 'available',
      source: 'opencode:/gquota',
      quotaUsedPercent: mostUsed.usedPercent,
      resetIn: mostUsed.resetIn,
      models,
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'opencode:/gquota',
      quotaUsedPercent: null,
      resetIn: null,
      models: [],
      error: error?.message || 'Unknown error',
    };
  }
}

async function fetchGeminiProfileQuota(homePath) {
  const command = 'gemini -p "Respond only with OK." --model gemini-2.5-flash --output-format json';

  try {
    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, GEMINI_CLI_HOME: homePath },
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });

    const output = `${stdout || ''}\n${stderr || ''}`;
    const payload = extractJsonBlock(stdout);
    const quota = parseQuotaState(output);

    return {
      status: quota.exhausted ? 'exhausted' : 'available',
      quotaUsedPercent: quota.exhausted ? 100 : null,
      resetIn: quota.resetIn,
      model: 'gemini-2.5-flash',
      requestStats: payload?.stats?.models?.['gemini-2.5-flash']?.api || null,
    };
  } catch (error) {
    const output = `${error?.stdout || ''}\n${error?.stderr || ''}`;
    const quota = parseQuotaState(output);

    return {
      status: quota.exhausted ? 'exhausted' : 'error',
      quotaUsedPercent: quota.exhausted ? 100 : null,
      resetIn: quota.resetIn,
      model: 'gemini-2.5-flash',
      error: quota.exhausted ? null : error?.message || 'Unknown error',
    };
  }
}

export async function GET() {
  try {
    const profiles = getAvailableProfiles();
    const quotas = [];
    const checkedAt = new Date().toISOString();

    if (!profiles.length) {
      return NextResponse.json({
        success: true,
        quotas: [],
        checkedAt,
        note: 'No Gemini profiles were found under ~/.gemini-profiles',
      });
    }

    for (const profile of profiles) {
      try {
        const homePath = getProfileHome(profile);
        const opencodeQuota = await fetchOpenCodeProfileQuota(homePath);
        const quotaResult =
          opencodeQuota.status === 'error' || opencodeQuota.status === 'unknown'
            ? await fetchGeminiProfileQuota(homePath)
            : opencodeQuota;

        quotas.push({
          profile,
          homePath,
          ...quotaResult,
        });
      } catch (error) {
        quotas.push({
          profile,
          status: 'error',
          quotaUsedPercent: null,
          resetIn: null,
          model: 'gemini-2.5-flash',
          error: error.message,
        });
      }
    }

    return NextResponse.json({ success: true, quotas, checkedAt });
  } catch (error) {
    console.error('Error fetching quotas:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
