'use strict';

const { resolveCommandBarIntent, buildCommandBarContext } = require('../zedIntentBridge');

describe('zedIntentBridge', () => {
  const surfaceController = {
    listTerminals: () => [
      { id: 'p1', label: 'Chase' },
      { id: 'p2', label: 'Cesar' },
    ],
  };

  test('maps run npm test to terminal-run', () => {
    const ctx = buildCommandBarContext(surfaceController);
    const hit = resolveCommandBarIntent('run npm test', ctx);
    expect(hit.intent).toBe('terminal-run');
    expect(hit.slots.command).toBe('npm test');
  });

  test('maps spanish ejecuta to terminal-run', () => {
    const hit = resolveCommandBarIntent(
      'ejecuta npm test',
      buildCommandBarContext(surfaceController)
    );
    expect(hit.intent).toBe('terminal-run');
    expect(hit.slots.command).toBe('npm test');
  });

  test('maps browser search', () => {
    const hit = resolveCommandBarIntent(
      'search for typescript docs',
      buildCommandBarContext(surfaceController)
    );
    expect(hit.intent).toBe('browser-search');
    expect(hit.slots.query).toContain('typescript');
  });
});
