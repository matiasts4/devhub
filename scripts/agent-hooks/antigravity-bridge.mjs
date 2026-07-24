#!/usr/bin/env node
/**
 * antigravity-bridge.mjs — DevHub hook bridge for Antigravity (agy).
 *
 * Installed into ~/.gemini/config/hooks.json by the DevHub hooks installer.
 * Antigravity invokes this script for each lifecycle event (terminal agent,
 * CLI, and IDE all honor the same hooks file).
 *
 * Usage (as installed):  node "<path>/antigravity-bridge.mjs" <EventName>
 *
 * Quirk: the JSON payload delivered on stdin does NOT include the event name,
 * so it must arrive as argv[2].
 *
 * Event → state mapping:
 *   PreInvocation           → working  (model invocation starting)
 *   PostInvocation          → working  (still in an active turn)
 *   PreToolUse/PostToolUse  → working  (tool activity)
 *   Stop + fullyIdle:true   → idle     (agent finished, awaiting user)
 *   Stop + fullyIdle:false  → working  (paused but not done — subagent etc.)
 *   unknown event           → exit 0   (ignore)
 *
 * Endpoint discovery: the hook runs in Antigravity's environment which does
 * NOT inherit DevHub's per-session env vars. We read the shared discovery
 * file maintained by DevHub servers: ~/.devhub/hook-bridge.json
 *   { "url": "http://127.0.0.1:<port>/api/terminal/agent-hook",
 *     "token": "<shared-bridge-token>", "updatedAt": <ms> }
 * Override path via DEVHUB_HOOK_BRIDGE_CONFIG (used by tests).
 *
 * FAIL-OPEN CONTRACT: this script must NEVER block, delay, or error the
 * agent. Any failure (missing config, server down, bad payload, timeout)
 * results in a silent exit 0. stdout is always empty (a stdout JSON body
 * like {"decision":"continue"} would alter agent behavior). stderr is used
 * only when DEVHUB_AGY_BRIDGE_DEBUG=1.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEBUG = process.env.DEVHUB_AGY_BRIDGE_DEBUG === '1';
const REQUEST_TIMEOUT_MS = 1500;

function debugLog(...args) {
  if (DEBUG) {
    process.stderr.write(`[agy-bridge] ${args.join(' ')}\n`);
  }
}

function failOpen(reason) {
  debugLog(`fail-open: ${reason}`);
  process.exit(0);
}

function mapEventToState(eventName, payload) {
  switch (eventName) {
    case 'PreInvocation':
    case 'PostInvocation':
    case 'PreToolUse':
    case 'PostToolUse':
      return 'working';
    case 'Stop':
      return payload?.fullyIdle === true ? 'idle' : 'working';
    default:
      return null;
  }
}

function resolveBridgeConfig() {
  const configPath =
    process.env.DEVHUB_HOOK_BRIDGE_CONFIG || join(homedir(), '.devhub', 'hook-bridge.json');
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.url !== 'string' || typeof parsed.token !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function readStdinPayload() {
  // Antigravity pipes the payload JSON on stdin. Read with a hard cap so a
  // hung pipe can never block the agent.
  const chunks = [];
  let total = 0;
  const MAX_BYTES = 64 * 1024;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      process.stdin.destroy();
      resolve(null);
    }, REQUEST_TIMEOUT_MS);

    process.stdin.on('data', (chunk) => {
      total += chunk.length;
      if (total <= MAX_BYTES) chunks.push(chunk);
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve({});
    });
    // If stdin is already closed (no payload), resolve immediately on next tick.
    process.nextTick(() => {
      if (process.stdin.readableEnded || process.stdin.destroyed) {
        clearTimeout(timer);
        resolve({});
      }
    });
  });
}

async function main() {
  const eventName = process.argv[2] || '';
  if (!eventName) failOpen('missing event name argument');

  const payload = (await readStdinPayload()) || {};
  const state = mapEventToState(eventName, payload);
  if (!state) failOpen(`unmapped event '${eventName}'`);

  const config = resolveBridgeConfig();
  if (!config) failOpen('no bridge config (~/.devhub/hook-bridge.json missing or invalid)');

  const body = JSON.stringify({
    token: config.token,
    state,
    agentType: 'agy',
    agent: 'agy',
    event: eventName,
    source: 'antigravity-hook',
    conversationId: payload.conversationId || null,
    terminationReason: payload.terminationReason || null,
    transcriptPath: payload.transcriptPath || null,
    workspacePaths: Array.isArray(payload.workspacePaths) ? payload.workspacePaths : null,
    executionNum: typeof payload.executionNum === 'number' ? payload.executionNum : null,
    at: Date.now(),
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    debugLog(`reported ${eventName} → ${state}`);
  } catch (err) {
    failOpen(`POST failed: ${err?.message || err}`);
  }

  process.exit(0);
}

main().catch((err) => failOpen(`unexpected: ${err?.message || err}`));
