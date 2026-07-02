'use strict';

const fs = require('fs');
const path = require('path');

const APP_PATH = path.resolve(__dirname, '..', 'App.js');

function readApp() {
  return fs.readFileSync(APP_PATH, 'utf8');
}

describe('App.js — motion-lab project-scoped route', () => {
  let app;
  beforeAll(() => {
    app = readApp();
  });

  test('does not expose top-level /motion-lab route', () => {
    expect(app).not.toMatch(/path=["']\/motion-lab["']/);
  });

  test('exposes /project/:projectId/motion-lab as a child of WorkspaceLayout', () => {
    expect(app).toMatch(/path=["']motion-lab["']/);
    expect(app).toMatch(/element=\{\s*<MotionLab\s*\/\s*\u003e\s*\}/);
  });

  test('still imports MotionLab view', () => {
    expect(app).toMatch(/import\s+MotionLab\s+from\s+['"]\.\/views\/MotionLab['"]/);
  });
});
