const fs = require('fs');
const path = require('path');

describe('packaged-launcher integration', () => {
  const launcherPath = path.join(
    process.cwd(),
    'packaging',
    'linux',
    'devhub-launcher'
  );
  const desktopEntryPath = path.join(
    process.cwd(),
    'packaging',
    'linux',
    'DevHub.desktop'
  );

  test('launcher script exists at packaging/linux/devhub-launcher', () => {
    expect(fs.existsSync(launcherPath)).toBe(true);
  });

  test('launcher execs the desktop app ELF, not the sidecar', () => {
    const content = fs.readFileSync(launcherPath, 'utf8');
    // Must exec the absolute path desktop app ELF, not the sidecar
    expect(content).toContain('exec "$DEVHUB_APP_ELF"');
    expect(content).toContain('DEVHUB_APP_ELF="/usr/bin/devhub"');
    // Must NOT exec the sidecar
    expect(content).not.toMatch(/DEVHUB_SIDECAR/);
    expect(content).not.toMatch(/devhub-server/);
  });

  test('launcher sources NVM if available and exports DEVHUB_NODE_BIN/NPM_BIN', () => {
    const content = fs.readFileSync(launcherPath, 'utf8');
    // NVM sourcing
    expect(content).toContain('NVM_DIR="$HOME/.nvm"');
    expect(content).toContain("nvm use --silent default");
    // Env exports for sidecar contract
    expect(content).toContain('export DEVHUB_NODE_BIN');
    expect(content).toContain('export DEVHUB_NPM_BIN');
    // DEVHUB_NODE_BIN resolved from active environment before being exported
    expect(content).toMatch(/DEVHUB_NODE_BIN="\$\{DEVHUB_NODE_BIN:-\$\(command -v node/);
  });

  test('desktop entry uses absolute-path Exec pointing to the launcher wrapper', () => {
    const entry = fs.readFileSync(desktopEntryPath, 'utf8');
    // The Exec must be an absolute path to the launcher wrapper, not bare "devhub"
    // and not /usr/bin/devhub (that is the Tauri ELF, not the wrapper)
    expect(entry).toMatch(/^Exec=\/usr\/lib\/DevHub\/bin\/devhub-launcher\b/m);
    expect(entry).not.toMatch(/^Exec=devhub\b/m);
    expect(entry).not.toMatch(/^Exec=\$HOME/);
    // Terminal=false is critical for detached launch
    expect(entry).toMatch(/^Terminal=false$/m);
  });

  test('tauri.conf.json installs launcher to /usr/lib/DevHub/bin/ and preserves /usr/bin/devhub as Tauri ELF', () => {
    const tauriConf = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'src-tauri', 'tauri.conf.json'), 'utf8')
    );

    // Check binaries array places sidecar at absolute path inside /usr/lib/DevHub
    const binaries = tauriConf.bundle?.binaries || [];
    const sidecarEntry = binaries.find(
      (b) => b.dest === '/usr/lib/DevHub/binaries/devhub-server'
    );
    expect(sidecarEntry).toBeDefined();
    expect(sidecarEntry.src).toBe('binaries/devhub-server-x86_64-unknown-linux-gnu');

    // Check deb files map the launcher to /usr/lib/DevHub/bin/devhub-launcher
    // IMPORTANT: /usr/bin/devhub must NOT be in deb files — it is the Tauri ELF
    const debFiles = tauriConf.bundle?.linux?.deb?.files;
    expect(debFiles).toBeDefined();
    expect(debFiles['../packaging/linux/devhub-launcher']).toBe('/usr/lib/DevHub/bin/devhub-launcher');
    // Verify /usr/bin/devhub is NOT being overwritten by the launcher mapping
    const usrBinDevhub = Object.values(debFiles).find(v => v === '/usr/bin/devhub');
    expect(usrBinDevhub).toBeUndefined();

    // Desktop entry should land at /usr/share/applications/DevHub.desktop
    const desktopDest = debFiles['../packaging/linux/DevHub.desktop'];
    expect(desktopDest).toBe('/usr/share/applications/DevHub.desktop');
  });

  test('launcher detects Node >=24 and exports DEVHUB_ALLOW_NODE24=1', () => {
    const content = fs.readFileSync(launcherPath, 'utf8');
    // Must detect Node 24+ version and export the allow flag
    expect(content).toMatch(/DEVHUB_ALLOW_NODE24/);
    expect(content).toMatch(/export DEVHUB_ALLOW_NODE24=1/);
    // Version check must cover v24, v25, v26
    expect(content).toMatch(/v24\.\*\|v25\.\*\|v26\.\*/);
  });

  test('Rust sidecar spawn forwards DEVHUB_ALLOW_NODE24 along with NODE_BIN and NPM_BIN', () => {
    const libRsPath = path.join(process.cwd(), 'src-tauri', 'src', 'lib.rs');
    const content = fs.readFileSync(libRsPath, 'utf8');
    // spawn_sidecar must forward DEVHUB_ALLOW_NODE24 so the sidecar respects it
    expect(content).toMatch(/\.env\("DEVHUB_ALLOW_NODE24"/);
  });

  test('Rust sidecar spawn forwards DEVHUB_NODE_BIN and DEVHUB_NPM_BIN env', () => {
    const libRsPath = path.join(process.cwd(), 'src-tauri', 'src', 'lib.rs');
    const content = fs.readFileSync(libRsPath, 'utf8');
    // spawn_sidecar should forward these env vars so the sidecar wrapper gets stable node selection
    expect(content).toMatch(/\.env\("DEVHUB_NODE_BIN"/);
    expect(content).toMatch(/\.env\("DEVHUB_NPM_BIN"/);
  });
});