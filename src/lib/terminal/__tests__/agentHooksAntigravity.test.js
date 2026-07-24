/**
 * Tests for Antigravity (agy) hooks support:
 *   - installer merge logic (fresh/existing/re-install/corrupt/third-party)
 *   - bridgeConfig discovery file
 *   - handleBridgeHookReport routing (conversationId/workspacePaths/fallback)
 *   - antigravity-bridge.mjs end-to-end with an HTTP stub server
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { execFile } from 'child_process';
import {
  ANTIGRAVITY_EVENTS,
  ANTIGRAVITY_HOOK_MARKER,
  buildAntigravityHooksConfig,
  buildAntigravityHookCommand,
  removeAntigravityHooks,
  isAntigravityHooksInstalled,
} from '../agentHooks/installer.js';
import {
  writeHookBridgeConfig,
  readHookBridgeConfig,
  HOOK_BRIDGE_CONFIG_PATH_ENV,
} from '../agentHooks/bridgeConfig.js';
import { handleBridgeHookReport } from '../agentHooks/handleHookReport.js';
import { AgentStateMachine } from '../agentTuiMetadata.shared.js';

const BRIDGE_PATH = '/repo/scripts/agent-hooks/antigravity-bridge.mjs';

describe('Antigravity hooks installer (buildAntigravityHooksConfig)', () => {
  test('fresh install creates all 5 events with bridge command', () => {
    const { json, wasCorrupt } = buildAntigravityHooksConfig('', BRIDGE_PATH);
    expect(wasCorrupt).toBe(false);

    const parsed = JSON.parse(json);
    expect(Object.keys(parsed.hooks).sort()).toEqual([...ANTIGRAVITY_EVENTS].sort());

    for (const event of ANTIGRAVITY_EVENTS) {
      expect(parsed.hooks[event]).toHaveLength(1);
      const handler = parsed.hooks[event][0].hooks[0];
      expect(handler.type).toBe('command');
      expect(handler.timeout).toBe(30);
      expect(handler.command).toContain('antigravity-bridge.mjs');
      expect(handler.command).toContain(` ${event}`);
    }
  });

  test('merges into existing config preserving third-party hooks', () => {
    const existing = JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            hooks: [{ type: 'command', command: 'echo third-party', timeout: 5 }],
          },
        ],
        CustomEvent: [{ hooks: [{ type: 'command', command: 'echo custom' }] }],
      },
      otherSetting: 'keep-me',
    });

    const { json, wasCorrupt } = buildAntigravityHooksConfig(existing, BRIDGE_PATH);
    expect(wasCorrupt).toBe(false);

    const parsed = JSON.parse(json);
    expect(parsed.otherSetting).toBe('keep-me');
    // Third-party entry preserved + DevHub entry appended
    expect(parsed.hooks.PreToolUse).toHaveLength(2);
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).toBe('echo third-party');
    expect(parsed.hooks.PreToolUse[1].hooks[0].command).toContain(ANTIGRAVITY_HOOK_MARKER);
    // Untouched custom event
    expect(parsed.hooks.CustomEvent).toHaveLength(1);
    expect(parsed.hooks.CustomEvent[0].hooks[0].command).toBe('echo custom');
  });

  test('re-install is idempotent (replaces previous DevHub entries, no duplicates)', () => {
    const first = buildAntigravityHooksConfig('', BRIDGE_PATH).json;
    const second = buildAntigravityHooksConfig(first, BRIDGE_PATH).json;

    const parsed = JSON.parse(second);
    for (const event of ANTIGRAVITY_EVENTS) {
      expect(parsed.hooks[event]).toHaveLength(1);
    }
    expect(second).toBe(first);
  });

  test('corrupt JSON → fresh config with wasCorrupt flag', () => {
    const { json, wasCorrupt } = buildAntigravityHooksConfig('{{{not json!!!', BRIDGE_PATH);
    expect(wasCorrupt).toBe(true);

    const parsed = JSON.parse(json);
    expect(Object.keys(parsed.hooks).sort()).toEqual([...ANTIGRAVITY_EVENTS].sort());
  });

  test('non-object JSON root treated as corrupt', () => {
    const { wasCorrupt } = buildAntigravityHooksConfig('[1,2,3]', BRIDGE_PATH);
    expect(wasCorrupt).toBe(true);
  });

  test('removeAntigravityHooks strips only DevHub entries', () => {
    const withThirdParty = JSON.stringify({
      hooks: {
        Stop: [
          { hooks: [{ type: 'command', command: 'echo mine' }] },
          { hooks: [{ type: 'command', command: `node "${BRIDGE_PATH}" Stop` }] },
        ],
      },
    });

    const result = JSON.parse(removeAntigravityHooks(withThirdParty));
    expect(result.hooks.Stop).toHaveLength(1);
    expect(result.hooks.Stop[0].hooks[0].command).toBe('echo mine');
  });

  test('isAntigravityHooksInstalled detects marker', () => {
    expect(isAntigravityHooksInstalled('')).toBe(false);
    const { json } = buildAntigravityHooksConfig('', BRIDGE_PATH);
    expect(isAntigravityHooksInstalled(json)).toBe(true);
  });

  test('buildAntigravityHookCommand normalizes backslashes', () => {
    const cmd = buildAntigravityHookCommand('C:\\repo\\scripts\\antigravity-bridge.mjs', 'Stop');
    expect(cmd).toBe('node "C:/repo/scripts/antigravity-bridge.mjs" Stop');
  });
});

describe('bridgeConfig (hook-bridge.json discovery file)', () => {
  let tmpDir;
  const originalEnv = process.env[HOOK_BRIDGE_CONFIG_PATH_ENV];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-bridgecfg-'));
    process.env[HOOK_BRIDGE_CONFIG_PATH_ENV] = path.join(tmpDir, 'hook-bridge.json');
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[HOOK_BRIDGE_CONFIG_PATH_ENV];
    } else {
      process.env[HOOK_BRIDGE_CONFIG_PATH_ENV] = originalEnv;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('write then read round-trips url and token', () => {
    writeHookBridgeConfig({
      url: 'http://127.0.0.1:3000/api/terminal/agent-hook',
      token: 'abc123',
    });
    const config = readHookBridgeConfig();
    expect(config.url).toBe('http://127.0.0.1:3000/api/terminal/agent-hook');
    expect(config.token).toBe('abc123');
    expect(typeof config.updatedAt).toBe('number');
  });

  test('read returns null when file missing', () => {
    expect(readHookBridgeConfig()).toBeNull();
  });

  test('read returns null when file corrupt', () => {
    fs.writeFileSync(process.env[HOOK_BRIDGE_CONFIG_PATH_ENV], '{{{bad', 'utf8');
    expect(readHookBridgeConfig()).toBeNull();
  });

  test('write throws without url or token', () => {
    expect(() => writeHookBridgeConfig({ token: 'x' })).toThrow('url is required');
    expect(() => writeHookBridgeConfig({ url: 'http://x' })).toThrow('token is required');
  });

  test('overwrite refreshes token', () => {
    writeHookBridgeConfig({ url: 'http://a', token: 'first' });
    writeHookBridgeConfig({ url: 'http://b', token: 'second' });
    expect(readHookBridgeConfig().token).toBe('second');
  });
});

describe('handleBridgeHookReport (agy bridge routing)', () => {
  let sessions;

  function makeSession(id, extra = {}) {
    return {
      id,
      agentType: 'agy',
      agentStateMachine: new AgentStateMachine(),
      agentTuiState: null,
      agentTuiStateAt: null,
      hookState: null,
      ...extra,
    };
  }

  beforeEach(() => {
    sessions = new Map();
  });

  const baseBody = {
    token: 'shared-token',
    state: 'working',
    agentType: 'agy',
    source: 'antigravity-hook',
    event: 'PreInvocation',
  };

  test('400 on missing token or state', () => {
    expect(handleBridgeHookReport(sessions, { state: 'working' }).status).toBe(400);
    expect(handleBridgeHookReport(sessions, { token: 'x' }).status).toBe(400);
    expect(handleBridgeHookReport(sessions, null).status).toBe(400);
  });

  test('400 on invalid state', () => {
    expect(handleBridgeHookReport(sessions, { ...baseBody, state: 'bogus' }).status).toBe(400);
  });

  test('403 on wrong bridge token when provided', () => {
    sessions.set('s1', makeSession('s1'));
    const result = handleBridgeHookReport(sessions, baseBody, Date.now(), {
      bridgeToken: 'expected',
    });
    expect(result.status).toBe(403);
  });

  test('404 when no session matches', () => {
    const result = handleBridgeHookReport(sessions, baseBody);
    expect(result.status).toBe(404);
  });

  test('routes by conversationId (sticky binding)', () => {
    const s1 = makeSession('s1', { agentConversationId: 'conv-A' });
    const s2 = makeSession('s2', { agentConversationId: 'conv-B' });
    sessions.set('s1', s1);
    sessions.set('s2', s2);

    const result = handleBridgeHookReport(sessions, {
      ...baseBody,
      conversationId: 'conv-B',
    });
    expect(result.status).toBe(204);
    expect(result.session.id).toBe('s2');
  });

  test('routes by workspacePaths when conversation unknown', () => {
    const s1 = makeSession('s1', { cwd: '/home/user/project-a' });
    sessions.set('s1', s1);

    const result = handleBridgeHookReport(sessions, {
      ...baseBody,
      conversationId: 'conv-new',
      workspacePaths: ['/home/user/project-a'],
    });
    expect(result.status).toBe(204);
    expect(result.session.id).toBe('s1');
    // Conversation bound for future routing
    expect(s1.agentConversationId).toBe('conv-new');
  });

  test('falls back to most recent agy session', () => {
    const s1 = makeSession('s1', { lastActivityAt: 1000 });
    const s2 = makeSession('s2', { lastActivityAt: 5000 });
    sessions.set('s1', s1);
    sessions.set('s2', s2);

    const result = handleBridgeHookReport(sessions, { ...baseBody, conversationId: 'conv-X' });
    expect(result.status).toBe(204);
    expect(result.session.id).toBe('s2');
  });

  test('publishes state and returns broadcast frame with agentType', () => {
    const s1 = makeSession('s1');
    sessions.set('s1', s1);
    const now = Date.now();

    const result = handleBridgeHookReport(sessions, baseBody, now);
    expect(result.status).toBe(204);
    expect(s1.hookState.state).toBe('running');
    expect(s1.hookState.source).toBe('antigravity-hook');
    expect(s1.hookState.event).toBe('PreInvocation');

    if (result.broadcast) {
      expect(result.broadcast.type).toBe('agent-state');
      expect(result.broadcast.agentTuiState).toBe('running');
      expect(result.broadcast.agentType).toBe('agy');
    }
  });

  test('Stop with idle state publishes idle', () => {
    const s1 = makeSession('s1', { agentTuiState: 'running' });
    sessions.set('s1', s1);
    const now = Date.now();

    // First get into running via hook
    handleBridgeHookReport(sessions, baseBody, now);
    const result = handleBridgeHookReport(
      sessions,
      { ...baseBody, state: 'idle', event: 'Stop' },
      now + 5000
    );
    expect(result.status).toBe(204);
    expect(s1.hookState.state).toBe('idle');
    expect(s1.hookState.terminationReason ?? null).toBeNull();
  });

  test('sets agentType on untyped session (routed via workspacePaths)', () => {
    const s1 = makeSession('s1', { agentType: null, cwd: '/repo' });
    sessions.set('s1', s1);

    const result = handleBridgeHookReport(sessions, {
      ...baseBody,
      workspacePaths: ['/repo'],
    });
    expect(result.status).toBe(204);
    expect(s1.agentType).toBe('agy');
  });
});

describe('antigravity-bridge.mjs end-to-end (HTTP stub)', () => {
  const bridgeScript = path.resolve(
    __dirname,
    '../../../../scripts/agent-hooks/antigravity-bridge.mjs'
  );
  let tmpDir;
  let configPath;
  let server;
  let serverPort;
  let receivedBodies;

  beforeAll((done) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-agybridge-'));
    configPath = path.join(tmpDir, 'hook-bridge.json');
    receivedBodies = [];

    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          receivedBodies.push(JSON.parse(body));
        } catch {
          receivedBodies.push(null);
        }
        res.writeHead(204);
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          url: `http://127.0.0.1:${serverPort}/api/terminal/agent-hook`,
          token: 'e2e-shared-token',
          updatedAt: Date.now(),
        }),
        'utf8'
      );
      done();
    });
  });

  afterAll((done) => {
    server.close(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      done();
    });
  });

  function runBridge(eventName, payload, env = {}) {
    // Async spawn (NOT spawnSync) — the stub server lives in this process and
    // needs the event loop free to accept the bridge's POST.
    return new Promise((resolve) => {
      const child = execFile(
        process.execPath,
        [bridgeScript, eventName],
        {
          env: {
            ...process.env,
            DEVHUB_HOOK_BRIDGE_CONFIG: configPath,
            ...env,
          },
          encoding: 'utf8',
          timeout: 8000,
        },
        (error, stdout, stderr) => {
          resolve({
            code: error ? (error.code ?? 1) : 0,
            stdout: stdout || '',
            stderr: stderr || '',
          });
        }
      );
      if (payload !== null) {
        child.stdin.write(payload ? JSON.stringify(payload) : '');
      }
      child.stdin.end();
    });
  }

  test('PreInvocation → working report', async () => {
    receivedBodies.length = 0;
    const result = await runBridge('PreInvocation', {
      conversationId: 'conv-123',
      workspacePaths: ['/repo'],
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(''); // never alter agent via stdout
    expect(receivedBodies).toHaveLength(1);
    expect(receivedBodies[0]).toMatchObject({
      token: 'e2e-shared-token',
      state: 'working',
      agentType: 'agy',
      source: 'antigravity-hook',
      event: 'PreInvocation',
      conversationId: 'conv-123',
      workspacePaths: ['/repo'],
    });
  });

  test('Stop + fullyIdle:true → idle report', async () => {
    receivedBodies.length = 0;
    const result = await runBridge('Stop', {
      conversationId: 'conv-123',
      fullyIdle: true,
      terminationReason: 'NO_TOOL_CALL',
      transcriptPath: '/home/u/.gemini/brain/conv-123/transcript.jsonl',
    });

    expect(result.code).toBe(0);
    expect(receivedBodies[0]).toMatchObject({
      state: 'idle',
      terminationReason: 'NO_TOOL_CALL',
      transcriptPath: '/home/u/.gemini/brain/conv-123/transcript.jsonl',
    });
  });

  test('Stop + fullyIdle:false → working report', async () => {
    receivedBodies.length = 0;
    await runBridge('Stop', { conversationId: 'c', fullyIdle: false });
    expect(receivedBodies[0].state).toBe('working');
  });

  test('PreToolUse and PostToolUse → working', async () => {
    receivedBodies.length = 0;
    await runBridge('PreToolUse', {});
    await runBridge('PostToolUse', {});
    expect(receivedBodies.map((b) => b.state)).toEqual(['working', 'working']);
  });

  test('unknown event → exit 0, no report (fail-open)', async () => {
    receivedBodies.length = 0;
    const result = await runBridge('SomeFutureEvent', {});
    expect(result.code).toBe(0);
    expect(receivedBodies).toHaveLength(0);
  });

  test('missing bridge config → exit 0, no report (fail-open)', async () => {
    receivedBodies.length = 0;
    const result = await runBridge(
      'PreInvocation',
      {},
      { DEVHUB_HOOK_BRIDGE_CONFIG: path.join(tmpDir, 'nonexistent.json') }
    );
    expect(result.code).toBe(0);
    expect(receivedBodies).toHaveLength(0);
  });

  test('server down → exit 0 (fail-open)', async () => {
    const deadConfig = path.join(tmpDir, 'dead-config.json');
    fs.writeFileSync(
      deadConfig,
      JSON.stringify({ url: 'http://127.0.0.1:1/api/terminal/agent-hook', token: 'x' }),
      'utf8'
    );
    const result = await runBridge('PreInvocation', {}, { DEVHUB_HOOK_BRIDGE_CONFIG: deadConfig });
    expect(result.code).toBe(0);
  });
});
