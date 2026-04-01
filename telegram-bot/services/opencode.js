/**
 * OpenCode runner service.
 *
 * Runs opencode inside a tmux session (which provides a real TTY),
 * polls captured pane output for completion, then tears down the session.
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const DEFAULT_TIMEOUT = 120_000;
const MAX_OUTPUT_LENGTH = 4000;
const POLL_INTERVAL = 3_000;
const STABLE_THRESHOLD = 10;
const MIN_CONTENT_CHARS = 20;

function stripAnsi(text) {
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\^[^\x1b]*\x1b\\/g, '');
}

function cleanOutput(text) {
  if (!text) return '';
  let cleaned = stripAnsi(text);
  cleaned = cleaned
    // Remove Kali banner
    .replace(/┏━.*$/gm, '')
    .replace(/┃.*$/gm, '')
    .replace(/┗━.*$/gm, '')
    // Remove zsh prompt decorations
    .replace(/┌──.*$/gm, '')
    .replace(/└─\$.*$/gm, '')
    .replace(/└─#.*$/gm, '')
    .replace(/^\$ /gm, '')
    .replace(/^# /gm, '')
    // Remove the opencode command echo (with any quote artifacts)
    .replace(/.*opencode run --agent.*\n?/gm, '')
    .replace(/.*solo OK'.*\n?/gm, '')
    .replace(/.*nde solo OK'.*\n?/gm, '')
    // Remove zsh warnings
    .replace(/zsh:.*\n?/gm, '')
    // Remove terminal control artifacts
    .replace(/\[\?1h=\[?2004h/g, '')
    .replace(/\[\?1l>\[?2004l/g, '')
    // "> agent · model" headers
    .replace(/^> .+? · .+?\n?/gm, '')
    .replace(/wen3\.6-plus-free\n?/g, '')
    // Thinking block markers
    .replace(/^<\/?thinking>\s*$/gm, '')
    // Repeated separator lines
    .replace(/^[=\-]{3,}\s*$/gm, '')
    // Progress bars
    .replace(/\[[═━─━═\s=>·]+\]\s*\d*%?\s*/g, '')
    // Terminal control remnants
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    // Collapse 3+ consecutive newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\n+/, '')
    .trim();
  return cleaned;
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

    // Use tmux run-shell instead of send-keys to avoid quoting issues
    // run-shell executes the command directly, not as keystrokes
    const escapedPrompt = prompt.replace(/'/g, "'\"'\"'");
    const modelFlag = model ? ` --model ${model}` : '';
    const safeCwd = cwd.replace(/ /g, '\\ ');
    const command = `cd ${safeCwd} && opencode run --agent ${agent}${modelFlag} '${escapedPrompt}'`;

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

    function doResolve(value) {
      if (resolved) return;
      resolved = true;
      clearInterval(pollId);
      clearTimeout(timeoutId);
      killSession();
      resolve(value);
    }

    function doReject(err) {
      if (resolved) return;
      resolved = true;
      clearInterval(pollId);
      clearTimeout(timeoutId);
      killSession();
      reject(err);
    }

    // Step 1: Create empty tmux session
    exec(`tmux new-session -d -s "${sessionName}"`, (err) => {
      if (err) {
        doReject(new Error(`No se pudo iniciar tmux: ${err.message}`));
        return;
      }

      // Step 2: Send command via send-keys
      exec(`tmux send-keys -t "${sessionName}" "${command}" Enter`, (sendErr) => {
        if (sendErr) {
          doReject(new Error(`No se pudo enviar comando: ${sendErr.message}`));
          return;
        }

        // Step 3: Poll for output
        pollId = setInterval(() => {
          if (resolved) return;

          exec(`tmux capture-pane -t "${sessionName}" -p 2>/dev/null`, (capErr, stdout) => {
            if (resolved) return;
            const raw = stdout || '';

            // Session ended
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
              logger.info(
                `OpenCode done (stable ${stableCount * (POLL_INTERVAL / 1000)}s, ${cleaned.length} chars)`
              );
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

        // Step 4: Hard timeout
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
