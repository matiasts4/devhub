const fs = require('fs');
const path = require('path');
const packageJson = require('../../package.json');

describe('native runtime integration', () => {
  test('package scripts ensure native modules before dev and build', () => {
    expect(packageJson.scripts['native:ensure']).toContain('ensure-native-runtime.cjs');
    expect(packageJson.scripts.predev).toBe('npm run native:ensure');
    expect(packageJson.scripts.prebuild).toBe('npm run native:ensure');
  });

  test('desktop wrapper can rebuild native modules in extracted standalone runtime', () => {
    const wrapperPath = path.join(
      process.cwd(),
      'src-tauri',
      'binaries',
      'devhub-server-x86_64-unknown-linux-gnu'
    );
    const wrapper = fs.readFileSync(wrapperPath, 'utf8');

    expect(wrapper).toContain('ensure_native_runtime');
    expect(wrapper).toContain('NPM_BIN');
    expect(wrapper).toContain('rebuild "$package_name"');
    expect(wrapper).toContain('better-sqlite3');
    expect(wrapper).toContain('node-pty');
  });

  test('installed desktop wrapper re-extracts corrupted better-sqlite3 bindings and resolves node/npm from the active environment', () => {
    const wrapperPath = path.join(
      process.cwd(),
      'src-tauri',
      'binaries',
      'devhub-server-x86_64-unknown-linux-gnu'
    );
    const wrapper = fs.readFileSync(wrapperPath, 'utf8');

    expect(wrapper).toContain('EXPECTED_BETTER_SQLITE3_BINDING');
    expect(wrapper).toContain('better-sqlite3/build/Release/better_sqlite3.node');
    expect(wrapper).toContain('elif [ ! -f "$EXPECTED_BETTER_SQLITE3_BINDING" ]; then');
    expect(wrapper).toContain('reextract_standalone_runtime');
    expect(wrapper).toContain('resolve_preferred_bin()');
    expect(wrapper).toContain('ACTIVE_NODE_BIN=$(command -v node 2>/dev/null || true)');
    expect(wrapper).toContain('ACTIVE_NPM_BIN=$(command -v npm 2>/dev/null || true)');
  });

  test('installed desktop wrapper prefers env override or active PATH node/npm before falling back to system binaries', () => {
    const wrapperPath = path.join(
      process.cwd(),
      'src-tauri',
      'binaries',
      'devhub-server-x86_64-unknown-linux-gnu'
    );
    const wrapper = fs.readFileSync(wrapperPath, 'utf8');

    expect(wrapper).toContain('SYSTEM_NODE_BIN="/usr/bin/node"');
    expect(wrapper).toContain('SYSTEM_NPM_BIN="/usr/bin/npm"');
    expect(wrapper).toContain('NODE_BIN=$(resolve_preferred_bin "${DEVHUB_NODE_BIN:-}" "$ACTIVE_NODE_BIN" "$SYSTEM_NODE_BIN")');
    expect(wrapper).toContain('NPM_BIN=$(resolve_preferred_bin "${DEVHUB_NPM_BIN:-}" "$ACTIVE_NPM_BIN" "$SYSTEM_NPM_BIN")');
    expect(wrapper).toContain('if [ -n "$env_override" ] && [ -x "$env_override" ]; then');
    expect(wrapper).toContain('if [ -n "$active_bin" ] && [ -x "$active_bin" ]; then');
    expect(wrapper).not.toContain('NODE_BIN=$(which node 2>/dev/null || echo "/usr/bin/node")');
    expect(wrapper).not.toContain('NPM_BIN=$(which npm 2>/dev/null || echo "/usr/bin/npm")');
    expect(wrapper).not.toContain('if [ "$IS_SYSTEM_INSTALL" = "1" ] && [ -x "$SYSTEM_NODE_BIN" ]; then');
  });

  test('desktop wrapper prepends the active node directory to PATH before npm rebuilds', () => {
    const wrapperPath = path.join(
      process.cwd(),
      'src-tauri',
      'binaries',
      'devhub-server-x86_64-unknown-linux-gnu'
    );
    const wrapper = fs.readFileSync(wrapperPath, 'utf8');

    expect(wrapper).toContain('prepend_node_bin_to_path()');
    expect(wrapper).toContain('rebuild_path="$(prepend_node_bin_to_path "$NODE_BIN" "$PATH")"');
    expect(wrapper).toContain('cd "$runtime_dir" && PATH="$rebuild_path" "$NPM_BIN" rebuild "$package_name"');
  });

  test('desktop wrapper ignores .next standalone in local tauri dev mode', () => {
    const wrapperPath = path.join(
      process.cwd(),
      'src-tauri',
      'binaries',
      'devhub-server-x86_64-unknown-linux-gnu'
    );
    const wrapper = fs.readFileSync(wrapperPath, 'utf8');
    const devBranch = wrapper.match(/# Caso 2: Desarrollo local \(tauri dev\)([\s\S]*?)\n    fi\nfi\n/);

    expect(devBranch).toBeTruthy();
    expect(devBranch[1]).toContain('NEXT_PATH=""');
    expect(devBranch[1]).toContain('tauri dev');
    expect(devBranch[1]).not.toContain('.next/standalone/server.js');
  });
});
