'use strict';

const fs = require('fs');
const path = require('path');

const APP_PATH = path.resolve(__dirname, '..', 'App.js');

function readApp() {
  return fs.readFileSync(APP_PATH, 'utf8');
}

describe('App.js — canonical settings routes and legacy redirect', () => {
  let app;

  beforeAll(() => {
    app = readApp();
  });

  test('imports the react-router settings layout wrapper', () => {
    expect(app).toMatch(
      /import\s+SettingsLayoutRouter\s+from\s+['"]\.\/components\/settings\/SettingsLayoutRouter['"]/
    );
  });

  test('imports the canonical settings page components', () => {
    expect(app).toMatch(
      /import\s+AppearancePage\s+from\s+['"]\.\/app\/settings\/appearance\/page['"]/
    );
    expect(app).toMatch(/import\s+AccountPage\s+from\s+['"]\.\/app\/settings\/account\/page['"]/);
    expect(app).toMatch(
      /import\s+LLMProvidersPage\s+from\s+['"]\.\/app\/settings\/llm-providers\/page['"]/
    );
  });

  test('mounts /project/:projectId/settings/* under SettingsLayoutRouter', () => {
    expect(app).toMatch(
      /<Route\s+path=["']settings\/\*["']\s+element=\{<SettingsLayoutRouter\s*\/\>\}>/
    );
  });

  test('nests appearance, account and llm-providers routes inside settings', () => {
    // Verify each canonical page is mounted as a nested route.
    expect(app).toMatch(
      /<Route\s+path=["']appearance["']\s+element=\{<AppearancePage\s*\/\>\}\s*\/>/
    );
    expect(app).toMatch(/<Route\s+path=["']account["']\s+element=\{<AccountPage\s*\/\>\}\s*\/>/);
    expect(app).toMatch(
      /<Route\s+path=["']llm-providers["']\s+element=\{<LLMProvidersPage\s*\/\>\}\s*\/>/
    );
  });

  test('redirects /project/:projectId/ajustes to /settings/appearance', () => {
    expect(app).toMatch(
      /<Route\s+path=["']ajustes["']\s+element=\{\u003cNavigate\s+to=["']\.\.\/settings\/appearance["']\s+replace\s*\/\u003e\}\s*\/\u003e/
    );
  });
});
