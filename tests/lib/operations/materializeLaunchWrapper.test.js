const fs = require('fs');

const {
  buildMaterializedLaunchCommand,
  materializeLaunchWrapperScript,
  resolveLaunchWrapperScriptPath,
} = require('../../../src/lib/operations/materializeLaunchWrapper.js');

describe('materializeLaunchWrapper', () => {
  const createdPaths = [];

  afterEach(() => {
    for (const scriptPath of createdPaths.splice(0)) {
      try {
        fs.unlinkSync(scriptPath);
      } catch {
        // Best-effort cleanup.
      }
    }
  });

  test('resolveLaunchWrapperScriptPath sanitizes launch and role segments', () => {
    expect(resolveLaunchWrapperScriptPath('launch-8c452b5d', 'coder')).toBe(
      '/tmp/devhub-launch-launch-8c452b5d-coder.sh'
    );
    expect(resolveLaunchWrapperScriptPath('launch/../evil', 'coder/1')).toBe(
      '/tmp/devhub-launch-launchevil-coder1.sh'
    );
  });

  test('materializeLaunchWrapperScript writes executable wrapper to disk', () => {
    const scriptPath = resolveLaunchWrapperScriptPath('launch-materialize-test', 'director');
    createdPaths.push(scriptPath);

    const writtenPath = materializeLaunchWrapperScript(
      '#!/usr/bin/env bash\necho ok\n',
      'launch-materialize-test',
      'director'
    );

    expect(writtenPath).toBe(scriptPath);
    expect(fs.readFileSync(scriptPath, 'utf8')).toContain('echo ok');
    const mode = fs.statSync(scriptPath).mode & 0o777;
    expect(mode).toBe(0o755);
  });

  test('buildMaterializedLaunchCommand returns one-line bash launcher', () => {
    const scriptPath = resolveLaunchWrapperScriptPath('launch-materialize-test', 'auditor');
    createdPaths.push(scriptPath);

    const command = buildMaterializedLaunchCommand(
      'echo swarm',
      'launch-materialize-test',
      'auditor'
    );
    expect(command).toBe(`bash ${scriptPath}`);
    expect(fs.readFileSync(scriptPath, 'utf8')).toBe('echo swarm');
  });
});
