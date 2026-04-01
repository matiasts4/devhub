#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);
const profilesDir = path.join(os.homedir(), '.gemini-profiles');
const resetRegex = /quota will reset after\s+([^\.\n]+)\./i;
const gquotaLineRegex = /`([^`]+)`:\s+(\*\*)?([0-9]+(?:\.[0-9]+)?)%\s+used(\*\*)?\s+[\u2014-]\s+resets in\s+([^\n]+)/gi;

function listProfiles() {
  if (!fs.existsSync(profilesDir)) return [];

  return fs
    .readdirSync(profilesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function parseState(output) {
  const exhausted = /exhausted your capacity on this model/i.test(output);
  const match = output.match(resetRegex);
  return {
    status: exhausted ? 'exhausted' : 'available',
    quotaUsedPercent: exhausted ? 100 : null,
    resetIn: match ? match[1].trim() : null,
  };
}

function parseGquotaModels(output) {
  const models = [];
  if (!output) return models;

  let match;
  while ((match = gquotaLineRegex.exec(output)) !== null) {
    models.push({
      model: match[1],
      usedPercent: Number(match[3]),
      resetIn: match[5].trim(),
    });
  }

  return models;
}

async function probeWithOpenCode(home) {
  const command = 'opencode run "/gquota"';
  const { stdout, stderr } = await execAsync(command, {
    env: { ...process.env, GEMINI_CLI_HOME: home },
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });

  const combined = `${stdout || ''}\n${stderr || ''}`;
  const models = parseGquotaModels(combined);

  if (!models.length) {
    return null;
  }

  const mostUsed = models.reduce((best, current) =>
    current.usedPercent > best.usedPercent ? current : best
  );

  return {
    status: mostUsed.usedPercent >= 100 ? 'exhausted' : 'available',
    quotaUsedPercent: mostUsed.usedPercent,
    resetIn: mostUsed.resetIn,
    models,
    source: 'opencode:/gquota',
  };
}

async function probeProfile(profile) {
  const home = path.join(profilesDir, profile);
  const command = 'gemini -p "Respond only with OK." --model gemini-2.5-flash --output-format json';

  try {
    try {
      const viaOpenCode = await probeWithOpenCode(home);
      if (viaOpenCode) {
        return {
          profile,
          home,
          ...viaOpenCode,
        };
      }
    } catch {
      // If OpenCode /gquota fails or times out, fallback to direct Gemini probe.
    }

    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, GEMINI_CLI_HOME: home },
      timeout: 45000,
      maxBuffer: 1024 * 1024,
    });

    const combined = `${stdout || ''}\n${stderr || ''}`;
    const parsed = parseState(combined);

    return {
      profile,
      ...parsed,
      home,
      source: 'gemini:headless',
    };
  } catch (error) {
    const combined = `${error.stdout || ''}\n${error.stderr || ''}`;
    const parsed = parseState(combined);

    return {
      profile,
      ...parsed,
      home,
      source: 'gemini:headless',
      error: parsed.status === 'error' ? error.message : null,
    };
  }
}

async function main() {
  const profiles = listProfiles();

  if (profiles.length === 0) {
    console.log('No profiles found in ~/.gemini-profiles');
    process.exit(0);
  }

  console.log(`Found ${profiles.length} profile(s). Checking Gemini quota state...`);

  const results = [];
  for (const profile of profiles) {
    // Sequential probing avoids overloading local retries and keeps output readable.
    const result = await probeProfile(profile);
    results.push(result);
  }

  for (const result of results) {
    const quotaLabel = result.quotaUsedPercent === null ? 'N/A' : `${result.quotaUsedPercent}%`;
    const resetLabel = result.resetIn || '-';
    const errorLabel = result.error ? ` | error: ${result.error}` : '';
    const sourceLabel = result.source ? ` | source: ${result.source}` : '';

    console.log(
      `${result.profile.padEnd(18)} status=${result.status.padEnd(9)} used=${quotaLabel.padEnd(6)} resetIn=${resetLabel}${sourceLabel}${errorLabel}`
    );

    if (Array.isArray(result.models) && result.models.length) {
      for (const model of result.models) {
        console.log(`  - ${model.model}: ${model.usedPercent}% used, resets in ${model.resetIn}`);
      }
    }
  }

  console.log('\nJSON summary:');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error('Failed to check quotas:', error);
  process.exit(1);
});
