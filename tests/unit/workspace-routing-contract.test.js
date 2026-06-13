const fs = require('fs');
const path = require('path');
const {
  getProjectEntryPath,
  getProjectPlanningPath,
  getLegacyWorkspaceRedirectPath,
} = require('../../src/lib/workspaceRouting.js');

describe('workspace routing contract', () => {
  test('sends new projects to dashboard and planning to dedicated page', () => {
    expect(getProjectEntryPath('proj-1')).toBe('/project/proj-1/dashboard');
    expect(getProjectPlanningPath('proj-1')).toBe('/project/proj-1/planificacion');
    expect(getProjectPlanningPath('proj-1', 'continue')).toBe(
      '/project/proj-1/planificacion?mode=continue'
    );
  });

  test('redirects stale agenthub links to swarm preserving query params', () => {
    expect(getLegacyWorkspaceRedirectPath('proj-1', '?plan=1')).toBe(
      '/project/proj-1/swarm?plan=1'
    );
    expect(getLegacyWorkspaceRedirectPath('proj-1')).toBe('/project/proj-1/swarm');
  });

  test('registers a safe nested redirect route for legacy agenthub URLs', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'App.js'), 'utf8');

    expect(source).toContain('path="agenthub"');
    expect(source).toContain('<LegacyAgentHubRedirect />');
  });
});
