const fs = require('fs');
const os = require('os');
const path = require('path');

const scriptPath = path.resolve(__dirname, '../../scripts/build-devhub-server-sidecar.cjs');

describe('devhub-server sidecar build helpers', () => {
  test('collectWindowsLauncherInputs includes wrapper and launcher manifest', () => {
    const api = require(scriptPath);
    const inputs = api.collectWindowsLauncherInputs();
    expect(inputs.some((entry) => entry.endsWith('devhub-server.cjs'))).toBe(true);
    expect(inputs.some((entry) => entry.endsWith('Cargo.toml'))).toBe(true);
  });

  test('syncLinuxSidecar skips copy when target is newer than source', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-sidecar-'));
    const linuxSource = path.join(tmpRoot, 'linux-devhub-server');
    const binariesDir = path.join(tmpRoot, 'binaries');
    const linuxTarget = path.join(binariesDir, 'devhub-server-x86_64-unknown-linux-gnu');

    fs.mkdirSync(binariesDir, { recursive: true });
    fs.writeFileSync(linuxSource, '#!/bin/sh\necho ok\n', 'utf8');
    fs.writeFileSync(linuxTarget, '#!/bin/sh\necho cached\n', 'utf8');

    const future = Date.now() + 60_000;
    fs.utimesSync(linuxTarget, future / 1000, future / 1000);

    const moduleSource = fs.readFileSync(scriptPath, 'utf8');
    const patched = moduleSource
      .replace(
        "const ROOT = path.join(__dirname, '..');",
        `const ROOT = ${JSON.stringify(tmpRoot)};`
      )
      .replace(
        "const LINUX_SOURCE = path.join(ROOT, 'packaging', 'linux', 'devhub-server');",
        `const LINUX_SOURCE = ${JSON.stringify(linuxSource)};`
      );

    const modulePath = path.join(tmpRoot, 'sidecar.cjs');
    fs.writeFileSync(modulePath, patched, 'utf8');

    jest.resetModules();
    const api = require(modulePath);
    api.syncLinuxSidecar();

    expect(fs.readFileSync(linuxTarget, 'utf8')).toContain('cached');
  });
});
