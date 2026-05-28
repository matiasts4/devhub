const fs = require('fs');
const path = require('path');

describe('SPA Shell Adoption — File Structure Verification', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../../src/App.js'), 'utf-8');
  const dashboardJsx = fs.readFileSync(
    path.join(__dirname, '../../src/views/Dashboard.jsx'),
    'utf-8'
  );
  const proyectosJsx = fs.readFileSync(
    path.join(__dirname, '../../src/views/Proyectos.jsx'),
    'utf-8'
  );
  const projectDashboardJsx = fs.readFileSync(
    path.join(__dirname, '../../src/views/ProjectDashboard.jsx'),
    'utf-8'
  );

  test('App.js imports UiShell and UiHeader from ui/system', () => {
    expect(appJs).toContain("import { UiShell, UiHeader } from '@/components/ui/system'");
  });

  test('App.js no longer imports PageHeader', () => {
    expect(appJs).not.toContain('import PageHeader');
    expect(appJs).not.toContain("from './components/PageHeader'");
  });

  test('App.js wraps WorkspaceLayout in UiShell with slots', () => {
    expect(appJs).toContain('<UiShell');
    expect(appJs).toContain('</UiShell>');
    expect(appJs).toContain('UiShell.Header');
    expect(appJs).toContain('UiShell.Sidebar');
    expect(appJs).toContain('UiShell.Content');
  });

  test('Dashboard.jsx imports UiHeader', () => {
    expect(dashboardJsx).toContain('UiHeader');
    expect(dashboardJsx).toContain("from '@/components/ui/system'");
  });

  test('Dashboard.jsx uses UiHeader Title and Actions slots', () => {
    expect(dashboardJsx).toContain('<UiHeader.Title>');
    expect(dashboardJsx).toContain('<UiHeader.Actions>');
  });

  test('Dashboard.jsx removed min-h-screen for scroll isolation', () => {
    expect(dashboardJsx).not.toContain('min-h-screen');
  });

  test('Proyectos.jsx imports UiHeader', () => {
    expect(proyectosJsx).toContain('UiHeader');
    expect(proyectosJsx).toContain("from '@/components/ui/system'");
  });

  test('Proyectos.jsx uses UiHeader Title and Actions slots', () => {
    expect(proyectosJsx).toContain('<UiHeader.Title>');
    expect(proyectosJsx).toContain('<UiHeader.Actions>');
  });

  test('Proyectos.jsx removed min-h-screen for scroll isolation', () => {
    expect(proyectosJsx).not.toContain('min-h-screen');
  });

  test('ProjectDashboard.jsx removed nested overflow-y-auto for scroll isolation', () => {
    // Should not have overflow-y-auto in its own markup to let UiShell.Content handle scroll
    expect(projectDashboardJsx).not.toContain('overflow-y-auto');
  });
});
