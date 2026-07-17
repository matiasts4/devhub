const {
  getProjectEntryPath,
  normalizeProjectPageKey,
  resolveProjectEntryPage,
} = require('../workspaceRouting');

describe('workspaceRouting entry page', () => {
  test('normalizeProjectPageKey rejects unknown', () => {
    expect(normalizeProjectPageKey('terminales')).toBe('terminales');
    expect(normalizeProjectPageKey('../evil')).toBeNull();
    expect(normalizeProjectPageKey('')).toBeNull();
  });

  test('resolveProjectEntryPage uses lastProjectPage when valid', () => {
    const getUIPrefs = () => ({ lastProjectPage: 'terminales' });
    expect(resolveProjectEntryPage('p1', { getUIPrefs })).toBe('terminales');
  });

  test('resolveProjectEntryPage falls back to dashboard', () => {
    expect(resolveProjectEntryPage('p1', { getUIPrefs: () => ({}) })).toBe('dashboard');
    expect(resolveProjectEntryPage('p1', { getUIPrefs: () => ({ lastProjectPage: 'nope' }) })).toBe(
      'dashboard'
    );
  });

  test('getProjectEntryPath includes resolved page', () => {
    const getUIPrefs = () => ({ lastProjectPage: 'terminales' });
    expect(getProjectEntryPath('abc', { getUIPrefs })).toBe('/project/abc/terminales');
  });
});
