/**
 * TerminalTabsManager unit tests — terminal-ux-redesign + terminal-session-persistence
 *
 * Tests pure functions extracted from TerminalTabsManager:
 * - getTabLabel(tab, index) — returns display label
 * - getActiveTabStyle(isActive) — returns CSS class tokens for active/inactive tabs
 * - getCloseButtonVisibility(isActive) — returns visibility class
 * - getRestoredTabLabel(tab, index) — returns label with ↺ prefix for restored sessions
 *
 * Spec requirements:
 * - Tab labels: display session title or "Terminal N"
 * - Active tab: amber bottom border (2px), lighter background
 * - Close button hidden by default, shown on hover (opacity-0 group-hover:opacity-100)
 * - + button present for adding new tabs
 * - Restored tab: label prefixed with ↺
 */

const {
  getTabLabel,
  getActiveTabStyle,
  getCloseButtonVisibility,
  getRestoredTabLabel,
} = require('../TerminalTabsManager.jsx');

describe('getTabLabel()', () => {
  test('returns tab.name when name is provided', () => {
    const tab = { id: '1', name: 'my-session' };
    expect(getTabLabel(tab, 0)).toBe('my-session');
  });

  test('returns "Terminal N" (1-indexed) when name is empty', () => {
    const tab = { id: '2', name: '' };
    expect(getTabLabel(tab, 2)).toBe('Terminal 3');
  });

  test('returns "Terminal 1" for first tab with no name', () => {
    const tab = { id: '1', name: '' };
    expect(getTabLabel(tab, 0)).toBe('Terminal 1');
  });
});

describe('getActiveTabStyle()', () => {
  test('active tab includes amber bottom border class', () => {
    const style = getActiveTabStyle(true);
    // Should include a border-bottom color using amber (accent-primary)
    expect(style).toContain('border-b-2');
  });

  test('active tab includes lighter background class', () => {
    const style = getActiveTabStyle(true);
    expect(style).toContain('bg-[var(--surface-elevated)]');
  });

  test('inactive tab does not include amber border class', () => {
    const style = getActiveTabStyle(false);
    expect(style).not.toContain('border-b-2');
  });

  test('inactive tab has dimmer background', () => {
    const style = getActiveTabStyle(false);
    expect(style).toContain('bg-[var(--surface-card)]');
  });
});

describe('getCloseButtonVisibility()', () => {
  test('active tab close button is always visible (opacity-100)', () => {
    const cls = getCloseButtonVisibility(true);
    expect(cls).toContain('opacity-100');
  });

  test('inactive tab close button is hidden by default (opacity-0)', () => {
    const cls = getCloseButtonVisibility(false);
    expect(cls).toContain('opacity-0');
  });

  test('inactive tab close button shows on group hover', () => {
    const cls = getCloseButtonVisibility(false);
    expect(cls).toContain('group-hover:opacity-100');
  });
});

describe('getRestoredTabLabel()', () => {
  test('prefixes label with ↺ when tab.restored is true and tab has a name', () => {
    const tab = { id: '1', name: 'my-project', restored: true };
    expect(getRestoredTabLabel(tab, 0)).toBe('↺ my-project');
  });

  test('prefixes "Terminal N" with ↺ when restored and no name', () => {
    const tab = { id: '1', name: '', restored: true };
    expect(getRestoredTabLabel(tab, 0)).toBe('↺ Terminal 1');
  });

  test('returns normal label when restored is false', () => {
    const tab = { id: '1', name: 'fresh-session', restored: false };
    expect(getRestoredTabLabel(tab, 0)).toBe('fresh-session');
  });

  test('returns normal label when restored is undefined', () => {
    const tab = { id: '1', name: '' };
    expect(getRestoredTabLabel(tab, 2)).toBe('Terminal 3');
  });
});
