/**
 * @jest-environment node
 */

const fs = require('fs/promises');
const os = require('os');
const path = require('path');

let tmpDir;
let originalCwd;

async function loadRoute() {
  jest.resetModules();
  return require('../route');
}

async function readStoredConfig() {
  const raw = await fs.readFile(path.join(tmpDir, 'data', 'llm-providers-config.json'), 'utf8');
  return JSON.parse(raw);
}

describe('POST /api/settings/llm-providers — zed provider persistence', () => {
  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devhub-llm-config-'));
    await fs.mkdir(path.join(tmpDir, 'data'), { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('persists the Zed provider where the chat resolver reads it', async () => {
    const { POST } = await loadRoute();
    const { getZedSettingsSync } = require('@/lib/llmProviderConfig');

    const res = await POST({
      json: async () => ({
        providers: { kimi_code: { KIMI_CODE_API_KEY: 'k', enabled: true } },
        settings: { zed: { provider: 'kimi_code' } },
      }),
    });

    expect(await res.json()).toEqual({ success: true });
    const stored = await readStoredConfig();
    expect(stored.settings.zed.provider).toBe('kimi_code');
    expect(getZedSettingsSync().provider).toBe('kimi_code');
  });

  test('accepts the legacy top-level zed key and keeps unrelated zed settings', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'data', 'llm-providers-config.json'),
      JSON.stringify({ providers: {}, settings: { zed: { provider: 'xai', voice: 'on' } } }),
      'utf8'
    );
    const { POST } = await loadRoute();

    await POST({ json: async () => ({ providers: {}, zed: { provider: 'minimax' } }) });

    const stored = await readStoredConfig();
    expect(stored.settings.zed).toEqual({ provider: 'minimax', voice: 'on' });
  });

  test('a second save is not served from the stale in-memory cache', async () => {
    const { POST } = await loadRoute();
    const { getZedSettingsSync } = require('@/lib/llmProviderConfig');

    await POST({ json: async () => ({ providers: {}, settings: { zed: { provider: 'xai' } } }) });
    expect(getZedSettingsSync().provider).toBe('xai');

    await POST({ json: async () => ({ providers: {}, settings: { zed: { provider: 'minimax' } } }) });
    expect(getZedSettingsSync().provider).toBe('minimax');
  });
});
