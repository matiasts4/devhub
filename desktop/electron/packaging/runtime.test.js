'use strict';

/**
 * Pure-ish unit checks for packaging/runtime helpers (no Electron app required).
 * Run: node desktop/electron/packaging/runtime.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  resolveUiUrl,
  sidecarPort,
  isPackagedMode,
  resolveResourcesPath,
  standaloneZipCandidates,
  locateStandaloneZip,
  resolveStandaloneDir,
  isStandaloneReady,
  needsRefresh,
  runtimeStatus,
  ensureRuntime,
  extractZip,
} = require('./runtime');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

test('resolveUiUrl respects DEVHUB_ELECTRON_URL', () => {
  const prev = process.env.DEVHUB_ELECTRON_URL;
  process.env.DEVHUB_ELECTRON_URL = 'http://127.0.0.1:3999';
  assert.strictEqual(resolveUiUrl(), 'http://127.0.0.1:3999');
  if (prev === undefined) delete process.env.DEVHUB_ELECTRON_URL;
  else process.env.DEVHUB_ELECTRON_URL = prev;
});

test('isPackagedMode false without app / env', () => {
  const prev = process.env.DEVHUB_ELECTRON_PACKAGED;
  delete process.env.DEVHUB_ELECTRON_PACKAGED;
  assert.strictEqual(isPackagedMode(null), false);
  if (prev !== undefined) process.env.DEVHUB_ELECTRON_PACKAGED = prev;
});

test('standaloneZipCandidates includes resources/standalone.zip', () => {
  const list = standaloneZipCandidates('/tmp/res');
  assert.ok(list.some((p) => p.replace(/\\/g, '/').endsWith('standalone.zip')));
});

test('resolveResourcesPath falls back to src-tauri/resources', () => {
  const prev = process.env.DEVHUB_RESOURCES_PATH;
  delete process.env.DEVHUB_RESOURCES_PATH;
  const root = resolveResourcesPath({ app: null });
  assert.ok(root.includes('src-tauri'));
  assert.ok(root.includes('resources'));
  if (prev !== undefined) process.env.DEVHUB_RESOURCES_PATH = prev;
});

test('locateStandaloneZip finds repo zip when present', () => {
  const zip = locateStandaloneZip({ app: null });
  // May or may not exist in every checkout; just ensure function returns string|null
  assert.ok(zip === null || typeof zip === 'string');
  if (zip) assert.ok(fs.existsSync(zip));
});

test('resolveStandaloneDir uses DEVHUB_STANDALONE_DIR', () => {
  const prev = process.env.DEVHUB_STANDALONE_DIR;
  process.env.DEVHUB_STANDALONE_DIR = path.join(os.tmpdir(), 'devhub-standalone-test');
  assert.strictEqual(resolveStandaloneDir({ app: null }), process.env.DEVHUB_STANDALONE_DIR);
  if (prev === undefined) delete process.env.DEVHUB_STANDALONE_DIR;
  else process.env.DEVHUB_STANDALONE_DIR = prev;
});

test('isStandaloneReady false for missing dir', () => {
  assert.strictEqual(isStandaloneReady(path.join(os.tmpdir(), 'no-such-devhub-dir-xyz')), false);
});

test('isStandaloneReady true when server.js present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-ready-'));
  fs.writeFileSync(path.join(dir, 'server.js'), 'module.exports = {}');
  assert.strictEqual(isStandaloneReady(dir), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('needsRefresh true without stamp', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-ref-'));
  const zip = path.join(dir, 'a.zip');
  fs.writeFileSync(zip, 'x');
  assert.strictEqual(needsRefresh(zip, dir), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('runtimeStatus returns dev mode without Electron app', () => {
  const prev = process.env.DEVHUB_ELECTRON_PACKAGED;
  delete process.env.DEVHUB_ELECTRON_PACKAGED;
  const status = runtimeStatus({ app: null });
  assert.strictEqual(status.mode, 'dev');
  assert.strictEqual(status.ok, true);
  assert.ok(status.uiUrl);
  assert.ok(status.sidecar);
  if (prev !== undefined) process.env.DEVHUB_ELECTRON_PACKAGED = prev;
});

(async () => {
  await testAsync('ensureRuntime dev does not require standalone extract', async () => {
    const prev = process.env.DEVHUB_ELECTRON_PACKAGED;
    delete process.env.DEVHUB_ELECTRON_PACKAGED;
    const result = await ensureRuntime({ app: null });
    assert.strictEqual(result.mode, 'dev');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.standalone.extracted, false);
    if (prev !== undefined) process.env.DEVHUB_ELECTRON_PACKAGED = prev;
  });

  await testAsync('extractZip uses injected execFile', async () => {
    const calls = [];
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-extract-'));
    const zip = path.join(dest, 'fake.zip');
    fs.writeFileSync(zip, 'not-a-real-zip');
    const out = path.join(dest, 'out');
    await extractZip(zip, out, {
      execFile: async (cmd, args) => {
        calls.push({ cmd, args });
        return { stdout: '', stderr: '' };
      },
    });
    assert.ok(calls.length === 1);
    assert.ok(fs.existsSync(out));
    fs.rmSync(dest, { recursive: true, force: true });
  });

  // sidecarPort is a number
  test('sidecarPort is finite', () => {
    assert.ok(Number.isFinite(sidecarPort()));
  });

  if (process.exitCode) {
    console.error('\nSome packaging/runtime tests failed');
  } else {
    console.log('\nAll packaging/runtime tests passed');
  }
})();
