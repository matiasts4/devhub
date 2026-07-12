#!/usr/bin/env node
/**
 * Coexistence guards: debug-tree wrapper must never classify as system install
 * when the shell inherits production DEVHUB_HOME / SIDECAR_PORT=4000.
 */
const assert = require('assert');
const os = require('os');
const path = require('path');

const wrapper = require('../packaging/devhub-server.cjs');
const { applyDevIsolationEnv, DEV_ISOLATION } = require('./tauri-cli.cjs');

const debugDir = path.resolve(__dirname, '..', 'src-tauri', 'target', 'debug');
const installDir = path.join(os.homedir(), 'AppData', 'Local', 'DevHub');
const prodHome = path.join(os.homedir(), '.devhub');

const polluted = {
  DEVHUB_HOME: prodHome,
  SIDECAR_PORT: '4000',
  DEVHUB_RUNTIME: 'production',
  NODE_ENV: 'production',
  PORT: '3400',
};

assert.strictEqual(
  wrapper.isRunningFromTauriDevTree(debugDir),
  true,
  'target/debug must be detected as tauri dev tree'
);

assert.strictEqual(
  wrapper.isPackagedDevelopmentRuntime(polluted, debugDir),
  true,
  'polluted production env + debug tree => development runtime'
);

assert.strictEqual(
  wrapper.isPackagedDevelopmentRuntime(polluted, installDir),
  false,
  'polluted production env + install dir => not development (path alone)'
);

assert.strictEqual(
  wrapper.isPackagedDevelopmentRuntime(
    { ...polluted, DEVHUB_RUNTIME: 'development' },
    installDir
  ),
  true,
  'explicit DEVHUB_RUNTIME=development forces coexistence'
);

const isolated = applyDevIsolationEnv(polluted);
assert.strictEqual(isolated.DEVHUB_HOME, DEV_ISOLATION.DEVHUB_HOME);
assert.strictEqual(isolated.DEVHUB_DB_PATH, DEV_ISOLATION.DEVHUB_DB_PATH);
assert.strictEqual(isolated.SIDECAR_PORT, '4001');
assert.strictEqual(isolated.DEVHUB_RUNTIME, 'development');
assert.strictEqual(isolated.NODE_ENV, 'development');
assert.notStrictEqual(isolated.DEVHUB_HOME, prodHome);

console.log('devhub-server-coexistence.test.cjs: ok');
