const path = require('path');
const os = require('os');

const { detectLayout, isPackagedDevelopmentRuntime } = require('../../packaging/devhub-server.cjs');

describe('devhub-server layout (dev + installed coexistence)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('isPackagedDevelopmentRuntime honors Tauri dev env', () => {
    expect(isPackagedDevelopmentRuntime({ DEVHUB_RUNTIME: 'development' })).toBe(true);
    expect(
      isPackagedDevelopmentRuntime({
        DEVHUB_HOME: path.join(os.homedir(), '.devhub-dev'),
      })
    ).toBe(true);
    expect(isPackagedDevelopmentRuntime({ SIDECAR_PORT: '4001' })).toBe(true);
    expect(isPackagedDevelopmentRuntime({ SIDECAR_PORT: '4000' })).toBe(false);
  });

  test('detectLayout stays in dev mode when standalone.zip exists but runtime is development', () => {
    process.env.DEVHUB_RUNTIME = 'development';
    process.env.DEVHUB_HOME = path.join(os.homedir(), '.devhub-dev');
    process.env.SIDECAR_PORT = '4001';

    const layout = detectLayout();

    expect(layout.isSystemInstall).toBe(0);
    expect(layout.nextPath).toBe('');
    expect(layout.devhubDir.replace(/\\/g, '/')).toMatch(/\.devhub-dev$/);
    expect(layout.ptyPath.replace(/\\/g, '/')).toContain('sidecar-backend/server.js');
  });
});
