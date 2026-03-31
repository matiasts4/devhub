/**
 * OpenCode runner service.
 *
 * Spawns `opencode run --agent <agent> "<prompt>"` as a child process,
 * captures stdout, strips ANSI escape codes and opencode UI artifacts,
 * and returns clean text.
 *
 * Timeout: 120 seconds (configurable).
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 120_000; // 120 seconds
const MAX_OUTPUT_LENGTH = 4000; // Telegram message limit safety margin

// ── Output Cleaning ──────────────────────────────────────────────────────────

/**
 * Strip ANSI escape codes from text.
 * @param {string} text
 * @returns {string}
 */
function stripAnsi(text) {
  return text
    .replace(/\x1b\[[0-9;]*m/g, '') // SGR color/style codes
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // All other escape sequences (cursor, erase, etc.)
    .replace(/\x1b\][^\x07]*\x07/g, '') // OSC sequences (terminal title, etc.)
    .replace(/\x1b\^[^\x1b]*\x1b\\/g, ''); // DCS sequences
}

/**
 * Remove opencode UI artifacts and normalize whitespace.
 *
 * Strips:
 * - "> agent · model" progress headers
 * - Thinking/thought block markers
 * - Repeated separator lines
 * - Leading/trailing blank lines
 *
 * @param {string} text
 * @returns {string}
 */
function cleanOutput(text) {
  if (!text) return '';

  let cleaned = stripAnsi(text);

  cleaned = cleaned
    // "> agent · model" or "> agent · model · thought" headers
    .replace(/^> .+? · .+?\n?/gm, '')
    // Thinking block markers: "thinking", "/thought"
    .replace(/^<\/?thinking>\s*$/gm, '')
    // Repeated dash/equals separator lines (3+ chars)
    .replace(/^[=\-]{3,}\s*$/gm, '')
    // Progress bars like [====>     ] or [████████░░]
    .replace(/\[[═━─━═\s=>·]+\]\s*\d*%?\s*/g, '')
    // Terminal control remnants (bell, backspace artifacts)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    // Collapse 3+ consecutive newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading blank lines
    .replace(/^\s*\n+/, '')
    .trim();

  return cleaned;
}

// ── Core Runner ──────────────────────────────────────────────────────────────

/**
 * Run an OpenCode agent with a prompt.
 *
 * @param {string} agent - Agent name (e.g. 'gentleman', 'sdd-orchestrator')
 * @param {string} prompt - The prompt/task to execute
 * @param {object} [options]
 * @param {number} [options.timeout] - Timeout in ms (default: 120000)
 * @param {string} [options.cwd] - Working directory (default: process.cwd())
 * @param {string} [options.model] - Optional model override
 * @returns {Promise<string>} Clean text output from the agent
 */
function run(agent, prompt, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, cwd = process.cwd(), model } = options;

  if (!agent || typeof agent !== 'string') {
    return Promise.reject(new Error('Agent name is required'));
  }
  if (!prompt || typeof prompt !== 'string') {
    return Promise.reject(new Error('Prompt is required'));
  }

  return new Promise((resolve, reject) => {
    const args = ['run', '--agent', agent];
    if (model) {
      args.push('--model', model);
    }
    args.push(prompt);

    logger.info(
      `opencode run --agent ${agent} "${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}"`
    );

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn('opencode', args, {
      cwd,
      env: { ...process.env },
      // Do NOT use spawn's built-in timeout — it fires 'timeout' event but
      // doesn't kill the process. We manage it manually for proper cleanup.
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      logger.error(`OpenCode timeout after ${timeout / 1000}s for agent "${agent}"`);
      child.kill('SIGTERM');
      // Force kill after 5s grace period
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        reject(new Error(`OpenCode timeout después de ${timeout / 1000}s para agente "${agent}"`));
        return;
      }

      if (signal === 'SIGKILL' || signal === 'SIGTERM') {
        reject(new Error(`OpenCode killed by signal ${signal} para agente "${agent}"`));
        return;
      }

      if (code !== 0) {
        const detail = cleanOutput(stderr || stdout);
        const msg = detail
          ? `OpenCode exit ${code}: ${detail.substring(0, MAX_OUTPUT_LENGTH)}`
          : `OpenCode exit ${code} (no output)`;
        logger.error(`OpenCode failed: ${msg}`);
        reject(new Error(msg));
        return;
      }

      const clean = cleanOutput(stdout);
      if (!clean) {
        const fallback = cleanOutput(stderr);
        if (fallback) {
          logger.warn(`OpenCode stdout empty for "${agent}", using stderr output`);
          resolve(fallback);
          return;
        }
        logger.warn(`OpenCode produced no output for agent "${agent}"`);
        reject(new Error('OpenCode no produjo respuesta'));
        return;
      }

      // Truncate if too long for Telegram
      if (clean.length > MAX_OUTPUT_LENGTH) {
        logger.warn(`OpenCode output truncated (${clean.length} → ${MAX_OUTPUT_LENGTH} chars)`);
        resolve(clean.substring(0, MAX_OUTPUT_LENGTH) + '\n\n… [respuesta truncada]');
        return;
      }

      resolve(clean);
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);

      // Provide actionable error messages
      if (err.code === 'ENOENT') {
        reject(new Error('OpenCode no está instalado o no está en el PATH'));
      } else if (err.code === 'EACCES') {
        reject(new Error('OpenCode no tiene permisos de ejecución'));
      } else {
        reject(new Error(`OpenCode error: ${err.message}`));
      }
    });
  });
}

// ── Agent Discovery ──────────────────────────────────────────────────────────

/**
 * Get available agents from opencode config or fallback to known defaults.
 *
 * Looks for opencode.json in common locations:
 * - Current working directory
 * - Home directory (~/.config/opencode/)
 * - Project root (parent dirs)
 *
 * @returns {Promise<string[]>}
 */
async function getAvailableAgents() {
  const knownAgents = ['gentleman', 'sdd-orchestrator', 'build', 'plan', 'qa'];

  const configPaths = [
    path.join(process.cwd(), 'opencode.json'),
    path.join(process.env.HOME || '', '.config', 'opencode', 'opencode.json'),
    path.join(process.cwd(), '.opencode.json'),
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(raw);

        // Try common config shapes
        const agents = config.agents || config.profiles || config.models || [];

        if (Array.isArray(agents)) {
          const names = agents
            .map((a) => {
              if (typeof a === 'string') return a;
              if (a && typeof a === 'object') return a.name || a.id || a.agent || null;
              return null;
            })
            .filter(Boolean);

          if (names.length > 0) {
            logger.info(`Loaded ${names.length} agents from ${configPath}`);
            return names;
          }
        }

        // If agents is an object (keyed by name)
        if (agents && typeof agents === 'object' && !Array.isArray(agents)) {
          return Object.keys(agents);
        }
      }
    } catch (err) {
      logger.warn(`Could not parse ${configPath}: ${err.message}`);
    }
  }

  logger.warn(`No opencode config found, using default agents: ${knownAgents.join(', ')}`);
  return knownAgents;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  run,
  cleanOutput,
  stripAnsi,
  getAvailableAgents,
  DEFAULT_TIMEOUT,
};
