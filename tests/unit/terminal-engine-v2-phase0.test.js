/**
 * Phase 0 compliance: VTE renderer is removed, xterm-only remains.
 *
 * Spec: openspec/changes/terminal-engine-v2/specs/terminal-renderer-default/spec.md
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

const {
  TERMINAL_RENDERER_MODES,
  getTerminalRendererCapabilities,
  resolveRendererSelection,
} = require(path.resolve(__dirname, '../../src/components/terminal/terminalRendererCapabilities'));

const { readTerminalRendererDefaultModeSetting, readTerminalRendererPreferences } = require(
  path.resolve(__dirname, '../../src/components/terminal/terminalRendererPreferences')
);

function sourceOf(...relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath), 'utf8');
}

function fileExists(...relativePath) {
  return fs.existsSync(path.join(repoRoot, ...relativePath));
}

describe('terminal-engine-v2 Phase 0 — VTE removal', () => {
  test('renderer mode list is xterm-only and excludes vte-experimental', () => {
    expect(TERMINAL_RENDERER_MODES).toEqual(['xterm', 'xterm-webgl', 'canvas']);
  });

  test('capabilities map excludes vte-experimental', () => {
    const capabilities = getTerminalRendererCapabilities();
    expect(capabilities).not.toHaveProperty('vte-experimental');
    expect(Object.keys(capabilities)).toEqual(['xterm', 'xterm-webgl', 'canvas']);
  });

  test('legacy vte-experimental preference resolves to the xterm default', () => {
    const selection = resolveRendererSelection({ requestedMode: 'vte-experimental' });
    expect(selection.effectiveMode).toBe('xterm-webgl');
    expect(selection.didFallback).toBe(false);
    expect(selection.requestedMode).toBe('xterm-webgl');
  });

  test('stored vte-experimental default is ignored and normalized to xterm-webgl', () => {
    const storage = {
      getItem: (key) =>
        key === 'devhub_terminal_renderer_default_mode' ? 'vte-experimental' : null,
    };
    expect(readTerminalRendererDefaultModeSetting(storage)).toBe('xterm-webgl');
  });

  test('stored vte-experimental workspace default is ignored and normalized to xterm-webgl', () => {
    const prefs = readTerminalRendererPreferences(
      {
        getItem: () =>
          JSON.stringify({
            version: 1,
            defaultMode: 'vte-experimental',
            workspaces: {},
          }),
      },
      null,
      []
    );
    expect(prefs.defaultMode).toBe('xterm-webgl');
  });

  test('VTE backend Rust source is removed', () => {
    expect(fileExists('src-tauri/src/native_vte.rs')).toBe(false);
  });

  test('VTE smoke binary source is removed', () => {
    expect(fileExists('src-tauri/linux-bin/gtk_vte_smoke.rs')).toBe(false);
  });

  test('VTE JS bridge source is removed', () => {
    expect(fileExists('src/lib/terminal/nativeVteBridge.js')).toBe(false);
  });

  test('VTE layout lifecycle helper is removed', () => {
    expect(fileExists('src/lib/terminal/nativeVteLayoutLifecycle.js')).toBe(false);
  });

  test('Cargo.toml no longer depends on zoha-vte', () => {
    const cargo = sourceOf('src-tauri/Cargo.toml');
    expect(cargo).not.toMatch(/zoha-vte/);
  });

  test('lib.rs no longer registers native_vte commands', () => {
    const libRs = sourceOf('src-tauri/src/lib.rs');
    expect(libRs).not.toMatch(/native_vte_/);
    expect(libRs).not.toMatch(/NativeVteState/);
  });

  test('CanvasTerminal no longer imports nativeVteBridge', () => {
    const source = sourceOf('src/components/pizarra/CanvasTerminal.jsx');
    expect(source).not.toMatch(/nativeVteBridge/);
    expect(source).not.toMatch(/vte-experimental/);
  });

  test('TerminalWorkspacesManager no longer references VTE', () => {
    const source = sourceOf('src/components/TerminalWorkspacesManager.jsx');
    expect(source).not.toMatch(/nativeVteBridge/);
    expect(source).not.toMatch(/vte-experimental/);
    expect(source).not.toMatch(/nativeVte/);
  });

  test('nativeLayoutSync no longer references VTE', () => {
    const source = sourceOf('src/components/terminal/nativeLayoutSync.js');
    expect(source).not.toMatch(/nativeVte/);
    expect(source).not.toMatch(/vte-experimental/);
    expect(source).not.toMatch(/dispatchNativeVteWorkspaceSync/);
  });
});
