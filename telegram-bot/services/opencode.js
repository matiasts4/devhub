/**
 * OpenCode runner service — tmux-based with temp script.
 *
 * Strategy:
 * 1. Write prompt to temp file (no escaping needed)
 * 2. Write a wrapper bash script that reads the file and runs opencode
 * 3. Create tmux session, run the script via send-keys
 * 4. Poll capture-pane until output is stable
 * 5. Kill session, return cleaned output
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('../utils/logger');

const DEFAULT_TIMEOUT = 120_000;
const MAX_OUTPUT_LENGTH = 4000;
const POLL_INTERVAL = 3_000;
const STABLE_THRESHOLD = 10;
const MIN_CONTENT_CHARS = 20;
const TMP_DIR = path.join(os.tmpdir(), 'devhub-bot');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function stripAnsi(text) {
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\^[^\x1b]*\x1b\\/g, '');
}

function cleanOutput(text) {
  if (!text) return '';
  let c = stripAnsi(text);
  c = c
    .replace(/┏━.*$/gm, '')
    .replace(/┃.*$/gm, '')
    .replace(/┗━.*$/gm, '')
    .replace(/┌──.*$/gm, '')
    .replace(/└─\$.*$/gm, '')
    .replace(/└─#.*$/gm, '')
    .replace(/^\$ /gm, '')
    .replace(/^# /gm, '')
    .replace(/.*opencode run --agent.*\n?/gm, '')
    .replace(/zsh:.*\n?/gm, '')
    .replace(/\[\?1h=\[?2004h/g, '')
    .replace(/\[\?1l>\[?2004l/g, '')
    .replace(/^> .+? · .+?\n?/gm, '')
    .replace(/wen3\.6-plus-free\n?/g, '')
    .replace(/^<\/?thinking>\s*$/gm, '')
    .replace(/^[=\-]{3,}\s*$/gm, '')
    .replace(/\[[═━─━═\s=>·]+\]\s*\d*%?\s*/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\n+/, '')
    .trim();
  return c;
}

function run(agent, prompt, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, cwd = process.cwd(), model } = options;
  if (!agent || typeof agent !== 'string')
    return Promise.reject(new Error('Agent name is required'));
  if (!prompt || typeof prompt !== 'string') return Promise.reject(new Error('Prompt is required'));

  return new Promise((resolve, reject) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    const sessionName = `oc-${ts}-${rand}`;
    const promptFile = path.join(TMP_DIR, `prompt_${ts}.txt`);
    const scriptFile = path.join(TMP_DIR, `run_${ts}.sh`);

    // Write prompt to file (no escaping needed)
    fs.writeFileSync(promptFile, prompt, 'utf-8');

    // Write wrapper script
    const modelFlag = model ? ` --model ${model}` : '';
    const script = `#!/bin/bash\ncd "${cwd}"\nPROMPT=$(cat '${promptFile}')\nopencode run --agent ${agent}${modelFlag} "$PROMPT"\n`;
    fs.writeFileSync(scriptFile, script, { mode: 0o755 });

    logger.info(`Running: opencode run --agent ${agent} (tmux: ${sessionName})`);

    let resolved = false;
    let lastOutput = '';
    let stableCount = 0;
    let hasRealContent = false;
    let pollId = null;
    let timeoutId = null;

    function killSession() {
      try {
        exec(`tmux kill-session -t "${sessionName}" 2>/dev/null`, () => {});
      } catch (_) {}
    }
    function cleanup() {
      try {
        fs.unlinkSync(promptFile);
      } catch (_) {}
      try {
        fs.unlinkSync(scriptFile);
      } catch (_) {}
    }

    function doResolve(value) {
      if (resolved) return;
      resolved = true;
      clearInterval(pollId);
      clearTimeout(timeoutId);
      killSession();
      cleanup();
      resolve(value);
    }
    function doReject(err) {
      if (resolved) return;
      resolved = true;
      clearInterval(pollId);
      clearTimeout(timeoutId);
      killSession();
      cleanup();
      reject(err);
    }

    // Create empty tmux session
    exec(`tmux new-session -d -s "${sessionName}"`, (err) => {
      if (err) {
        doReject(new Error(`No se pudo iniciar tmux: ${err.message}`));
        return;
      }

      // Send the script path and execute it
      exec(`tmux send-keys -t "${sessionName}" "bash '${scriptFile}'" Enter`, (sendErr) => {
        if (sendErr) {
          doReject(new Error(`No se pudo enviar comando: ${sendErr.message}`));
          return;
        }

        // Poll for output
        pollId = setInterval(() => {
          if (resolved) return;
          exec(`tmux capture-pane -t "${sessionName}" -p 2>/dev/null`, (capErr, stdout) => {
            if (resolved) return;
            const raw = stdout || '';

            if (capErr) {
              const clean = cleanOutput(lastOutput);
              if (clean && clean.length >= MIN_CONTENT_CHARS) {
                doResolve(
                  clean.length > MAX_OUTPUT_LENGTH
                    ? clean.substring(0, MAX_OUTPUT_LENGTH) + '\n\n… [truncada]'
                    : clean
                );
              } else {
                doReject(new Error('OpenCode no produjo respuesta'));
              }
              return;
            }

            const cleaned = cleanOutput(raw);
            if (cleaned.length >= MIN_CONTENT_CHARS) hasRealContent = true;

            if (raw === lastOutput && raw.length > 0) {
              stableCount++;
            } else {
              stableCount = 0;
              lastOutput = raw;
            }

            if (stableCount >= STABLE_THRESHOLD && hasRealContent) {
              logger.info(`OpenCode done (stable ${stableCount * 3}s, ${cleaned.length} chars)`);
              doResolve(
                cleaned.length > MAX_OUTPUT_LENGTH
                  ? cleaned.substring(0, MAX_OUTPUT_LENGTH) + '\n\n… [truncada]'
                  : cleaned
              );
              return;
            }
            if (stableCount >= STABLE_THRESHOLD * 2 && !hasRealContent) {
              doReject(new Error('OpenCode se quedó sin producir output'));
            }
          });
        }, POLL_INTERVAL);

        // Hard timeout
        timeoutId = setTimeout(() => {
          if (resolved) return;
          logger.error(`OpenCode timeout after ${timeout / 1000}s`);
          exec(`tmux capture-pane -t "${sessionName}" -p 2>/dev/null`, (_e, finalOutput) => {
            const raw = finalOutput || lastOutput;
            const clean = cleanOutput(raw);
            if (clean && clean.length >= MIN_CONTENT_CHARS) {
              doResolve(clean.substring(0, MAX_OUTPUT_LENGTH) + '\n\n… [timeout — parcial]');
            } else {
              doReject(new Error(`OpenCode timeout después de ${timeout / 1000}s`));
            }
          });
        }, timeout);
      });
    });
  });
}

async function getAvailableAgents() {
  const knownAgents = ['gentleman', 'sdd-orchestrator', 'build', 'plan', 'qa'];
  const configPaths = [
    path.join(process.cwd(), 'opencode.json'),
    path.join(process.env.HOME || '', '.config', 'opencode', 'opencode.json'),
  ];
  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const agents = config.agents || config.profiles || config.models || [];
        if (Array.isArray(agents)) {
          const names = agents
            .map((a) => (typeof a === 'string' ? a : a?.name || a?.id || a?.agent || null))
            .filter(Boolean);
          if (names.length > 0) return names;
        }
        if (agents && typeof agents === 'object' && !Array.isArray(agents))
          return Object.keys(agents);
      }
    } catch (_) {}
  }
  return knownAgents;
}

module.exports = { run, cleanOutput, stripAnsi, getAvailableAgents, DEFAULT_TIMEOUT };
