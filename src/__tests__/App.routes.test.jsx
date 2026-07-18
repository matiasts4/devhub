'use strict';

const fs = require('fs');
const path = require('path');

const APP_PATH = path.resolve(__dirname, '..', 'App.js');
const AJUSTES_PATH = path.resolve(__dirname, '..', 'views', 'Ajustes.jsx');

function readApp() {
  return fs.readFileSync(APP_PATH, 'utf8');
}

describe('App.js — Ajustes route (settings/* removed)', () => {
  let app;

  beforeAll(() => {
    app = readApp();
  });

  test('does NOT import the removed settings layout wrapper', () => {
    expect(app).not.toMatch(
      /import\s+SettingsLayoutRouter\s+from\s+['"]\.\/components\/settings\/SettingsLayoutRouter['"]/
    );
  });

  test('does NOT import the removed settings page components', () => {
    expect(app).not.toMatch(
      /import\s+AppearancePage\s+from\s+['"]\.\/app\/settings\/appearance\/page['"]/
    );
    expect(app).not.toMatch(
      /import\s+AccountPage\s+from\s+['"]\.\/app\/settings\/account\/page['"]/
    );
    expect(app).not.toMatch(
      /import\s+LLMProvidersPage\s+from\s+['"]\.\/app\/settings\/llm-providers\/page['"]/
    );
  });

  test('does NOT mount /project/:projectId/settings/*', () => {
    expect(app).not.toMatch(/<Route\s+path=["']settings\/\*["']/);
  });

  test('mounts Ajustes directly at /project/:projectId/ajustes', () => {
    // Ajustes must be mounted at the canonical path with no redirect.
    expect(app).toMatch(/<Route\s+path=["']ajustes["']\s+element=\{<Ajustes\s*\/\>\}\s*\/>/);
    // The legacy redirect to ../settings/appearance MUST be gone.
    expect(app).not.toMatch(
      /<Route\s+path=["']ajustes["']\s+element=\{\u003cNavigate\s+to=["']\.\.\/settings\/appearance["']/
    );
  });

  test('Ajustes source file is wired (sanity check)', () => {
    expect(fs.existsSync(AJUSTES_PATH)).toBe(true);
    const ajustes = fs.readFileSync(AJUSTES_PATH, 'utf8');
    // Ajustes exposes the morphology selector with the post-PR-2 testid prefix.
    expect(ajustes).toMatch(/ajustes-morphology-option-/);
  });
});

describe('App.js — Terminales sidebar focus + warm', () => {
  let app;

  beforeAll(() => {
    app = readApp();
  });

  test('resolves sidebar width via helper (0px Terminales default)', () => {
    expect(app).toMatch(/resolveWorkspaceSidebarWidth/);
    expect(app).toMatch(/terminalesSidebarPeek/);
    expect(app).toMatch(/onToggleNavSidebar/);
  });

  test('route nav uses opacity tokens without mode=wait', () => {
    expect(app).not.toMatch(/mode=["']wait["']/);
    expect(app).toMatch(/TRANSITION\.fast/);
    expect(app).not.toMatch(/scale:\s*routeScale/);
  });

  test('does not eager soft-mount TWM from entry-page preference alone', () => {
    expect(app).not.toMatch(/resolveProjectEntryPage\(projectId\)\s*===\s*['"]terminales['"]/);
  });
});
