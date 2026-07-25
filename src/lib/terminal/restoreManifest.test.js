import {
  RESTORE_MANIFEST_VERSION,
  createDefaultRestoreManifest,
  normalizeRestoreManifest,
} from './restoreManifest';

describe('restoreManifest', () => {
  it('creates default restore manifest with versioned shape', () => {
    const manifest = createDefaultRestoreManifest({
      appSessionId: 'app-1',
      projectId: 'project-1',
      workspaceId: 'ws-1',
    });

    expect(manifest.version).toBe(RESTORE_MANIFEST_VERSION);
    expect(manifest.appSessionId).toBe('app-1');
    expect(manifest.activeProjectId).toBe('project-1');
    expect(manifest.activeWorkspaceId).toBe('ws-1');
    expect(manifest.workspaces).toEqual([]);
    expect(manifest.terminalSessions).toEqual([]);
    expect(manifest.swarmRuns).toEqual([]);
  });

  it('normalizes invalid or partial payload into safe manifest', () => {
    const manifest = normalizeRestoreManifest({
      version: 999,
      activeProjectId: 42,
      terminalSessions: [
        null,
        { terminalId: 'term-1', panelId: 'p-1' },
        { terminalId: 'term-1', panelId: 'p-1-duplicate' },
      ],
      swarmRuns: [{ runId: 'run-1', missionId: 'mission-1' }],
    });

    expect(manifest.version).toBe(RESTORE_MANIFEST_VERSION);
    expect(manifest.activeProjectId).toBeNull();
    expect(manifest.terminalSessions).toHaveLength(1);
    expect(manifest.terminalSessions[0]).toEqual(
      expect.objectContaining({ terminalId: 'term-1', panelId: 'p-1' })
    );
    expect(manifest.swarmRuns).toEqual([
      expect.objectContaining({ runId: 'run-1', missionId: 'mission-1' }),
    ]);
  });

  it('preserves valid manifest fields and strips unknown record types', () => {
    const manifest = normalizeRestoreManifest({
      version: 1,
      appSessionId: 'app-2',
      activeProjectId: 'project-2',
      activeWorkspaceId: 'ws-2',
      workspaces: [{ workspaceId: 'ws-2', tabs: ['a', 'b'] }, 'bad'],
      terminalSessions: [{ terminalId: 'term-2', panelId: 'p-2', cwd: '/tmp' }],
      swarmRuns: [{ runId: 'run-2', launchId: 'launch-2', missionId: 'mission-2' }],
    });

    expect(manifest.appSessionId).toBe('app-2');
    expect(manifest.activeProjectId).toBe('project-2');
    expect(manifest.workspaces).toHaveLength(1);
    expect(manifest.workspaces[0]).toEqual(expect.objectContaining({ workspaceId: 'ws-2' }));
    expect(manifest.terminalSessions[0]).toEqual(
      expect.objectContaining({ terminalId: 'term-2', cwd: '/tmp' })
    );
    expect(manifest.swarmRuns[0]).toEqual(
      expect.objectContaining({ runId: 'run-2', missionId: 'mission-2' })
    );
  });
});
