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
    // Remove bash script execution line
    .replace(/.*bash.*devhub-bot.*\.sh.*\n?/gm, '')
    .replace(/.*bash.*run_.*\.sh.*\n?/gm, '')
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
    // Remove the opencode command echo
    .replace(/.*opencode run --agent.*\n?/gm, '')
    // Remove zsh warnings
    .replace(/zsh:.*\n?/gm, '')
    // Remove terminal control artifacts
    .replace(/\[\?1h=\[?2004h/g, '')
    .replace(/\[\?1l>\[?2004l/g, '')
    // "> agent · model" headers
    .replace(/^> .+? · .+?\n?/gm, '')
    .replace(/wen3\.6-plus-free\n?/g, '')
    // Remove leaked tool execution traces (MCP/mem/tool logs)
    .replace(/^[⚙🔧]\s*\S+\s*\{[\s\S]*?\}\s*$/gm, '')
    .replace(/^\s*(?:mcp\d*_|engram_|mem_|tool_)[\w.-]*\s*\{[\s\S]*?\}\s*$/gm, '')
    // Remove occasional single-line JSON arg dumps that start with "content":"**What**"
    .replace(/^\{\s*"content"\s*:\s*"\*\*What\*\*[\s\S]*?\}\s*$/gm, '')
    // Remove narrated tool actions leaked into text output
    .replace(/^\s*[→>-]\s*Read\b.*$/gim, '')
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

    // Write wrapper script — captures stderr, preserves exit code
    const modelFlag = model ? ` --model ${model}` : '';
    const script =
      `#!/bin/bash\n` +
      `cd "${cwd}"\n` +
      `PROMPT=$(cat '${promptFile}')\n` +
      `OUTPUT=$(opencode run --agent ${agent}${modelFlag} "$PROMPT" 2>&1)\n` +
      `EXIT_CODE=$?\n` +
      `echo "$OUTPUT"\n` +
      `exit $EXIT_CODE\n`;
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

    // Helper to build the final resolved value (deduplicated truncation logic)
    function finalizeOutput(raw, suffix) {
      const clean = cleanOutput(raw);
      if (!clean || clean.length < MIN_CONTENT_CHARS) return null;
      const truncated =
        clean.length > MAX_OUTPUT_LENGTH
          ? clean.substring(0, MAX_OUTPUT_LENGTH) + '\n\n… ' + (suffix || '[truncada]')
          : clean;
      return truncated;
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

        // Poll for output — capture full scrollback with -S -10000 -E -1
        pollId = setInterval(() => {
          if (resolved) return;
          exec(
            `tmux capture-pane -t "${sessionName}" -p -S -10000 -E -1 2>/dev/null`,
            (capErr, stdout) => {
              if (resolved) return;
              const raw = stdout || '';

              if (capErr) {
                const final = finalizeOutput(lastOutput, '[truncada]');
                if (final) {
                  doResolve(final);
                } else {
                  doReject(new Error('OpenCode no produjo respuesta'));
                }
                return;
              }

              const cleaned = cleanOutput(raw);
              if (cleaned.length >= MIN_CONTENT_CHARS) hasRealContent = true;

              // Detect when shell prompt returns = opencode finished
              // Check if the LAST non-empty line is the shell prompt
              const lines = raw.split('\n').filter((l) => l.trim().length > 0);
              const lastLine = lines[lines.length - 1] || '';
              const shellPromptReturned =
                lastLine.includes('└─$') || lastLine.includes('└─#') || /^\$ $/.test(lastLine);

              // Deduplicated completion detection
              function tryResolveWithPrompt() {
                const final = finalizeOutput(raw, '[truncada]');
                if (final) {
                  logger.info(`OpenCode done (shell prompt returned, ${cleaned.length} chars)`);
                  doResolve(final);
                }
              }

              if (shellPromptReturned && hasRealContent) {
                // Wait for 2 consecutive polls to ensure truly done
                if (stableCount >= 2) {
                  tryResolveWithPrompt();
                  return;
                }
                stableCount++;
              } else if (raw === lastOutput && raw.length > 0) {
                stableCount++;
              } else {
                stableCount = 0;
                lastOutput = raw;
              }

              // Fallback: stable for 30s even without shell prompt detection
              if (stableCount >= STABLE_THRESHOLD && hasRealContent) {
                const final = finalizeOutput(raw, '[truncada]');
                if (final) {
                  logger.info(
                    `OpenCode done (stable ${stableCount * 3}s, ${cleaned.length} chars)`
                  );
                  doResolve(final);
                }
                return;
              }
              if (stableCount >= STABLE_THRESHOLD * 2 && !hasRealContent) {
                doReject(new Error('OpenCode se quedó sin producir output'));
              }
            }
          );
        }, POLL_INTERVAL);

        // Hard timeout
        timeoutId = setTimeout(() => {
          if (resolved) return;
          logger.error(`OpenCode timeout after ${timeout / 1000}s`);
          exec(
            `tmux capture-pane -t "${sessionName}" -p -S -10000 -E -1 2>/dev/null`,
            (_e, finalOutput) => {
              const raw = finalOutput || lastOutput;
              const final = finalizeOutput(raw, '[timeout — parcial]');
              if (final) {
                doResolve(final);
              } else {
                doReject(new Error(`OpenCode timeout después de ${timeout / 1000}s`));
              }
            }
          );
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
