/**
 * @jest-environment jsdom
 */
import { PROVIDERS } from '../types.js';
import {
  QUOTA_PREFERENCES_KEY,
  isProviderEnabled,
  moveProvider,
  readQuotaPreferences,
  resolveBadgeProvider,
  toggleProvider,
  writeQuotaPreferences,
} from '../quotaPreferences.js';

const ALL = Object.values(PROVIDERS);

describe('quotaPreferences', () => {
  beforeEach(() => {
    window.localStorage.removeItem(QUOTA_PREFERENCES_KEY);
  });

  test('defaults to all providers enabled, auto default', () => {
    const prefs = readQuotaPreferences();
    expect(prefs.providerOrder).toEqual(ALL);
    expect(prefs.defaultProvider).toBeNull();
  });

  test('write normalizes unknown ids and persists', () => {
    const prefs = writeQuotaPreferences({
      providerOrder: ['kimi', 'bogus', 'kimi', 'antigravity'],
      defaultProvider: 'bogus',
    });
    expect(prefs.providerOrder).toEqual(['kimi', 'antigravity']);
    // defaultProvider must be an enabled provider
    expect(prefs.defaultProvider).toBeNull();

    const reread = readQuotaPreferences();
    expect(reread.providerOrder).toEqual(['kimi', 'antigravity']);
  });

  test('toggleProvider disables and re-enables (appended at end)', () => {
    let prefs = readQuotaPreferences();
    prefs = toggleProvider(prefs, 'zai');
    expect(isProviderEnabled(prefs, 'zai')).toBe(false);
    expect(prefs.providerOrder).not.toContain('zai');

    prefs = toggleProvider(prefs, 'zai');
    expect(isProviderEnabled(prefs, 'zai')).toBe(true);
    expect(prefs.providerOrder[prefs.providerOrder.length - 1]).toBe('zai');
  });

  test('toggleProvider clears pin when disabling the default', () => {
    const pinned = writeQuotaPreferences({ providerOrder: ALL, defaultProvider: 'kimi' });
    const next = toggleProvider(pinned, 'kimi');
    expect(next.defaultProvider).toBeNull();
  });

  test('moveProvider swaps positions and clamps at edges', () => {
    let prefs = writeQuotaPreferences({ providerOrder: ['kimi', 'grok', 'codex'], defaultProvider: null });
    prefs = moveProvider(prefs, 'grok', -1);
    expect(prefs.providerOrder).toEqual(['grok', 'kimi', 'codex']);
    prefs = moveProvider(prefs, 'grok', -1); // already first
    expect(prefs.providerOrder).toEqual(['grok', 'kimi', 'codex']);
    prefs = moveProvider(prefs, 'codex', 1); // already last
    expect(prefs.providerOrder).toEqual(['grok', 'kimi', 'codex']);
  });

  test('resolveBadgeProvider: pinned default wins over detection', () => {
    const prefs = { providerOrder: ['kimi', 'grok'], defaultProvider: 'kimi' };
    expect(resolveBadgeProvider(prefs, 'grok')).toBe('kimi');
  });

  test('resolveBadgeProvider: detected provider when enabled and no pin', () => {
    const prefs = { providerOrder: ['kimi', 'grok'], defaultProvider: null };
    expect(resolveBadgeProvider(prefs, 'grok')).toBe('grok');
  });

  test('resolveBadgeProvider: falls back to first enabled when detected is disabled', () => {
    const prefs = { providerOrder: ['kimi'], defaultProvider: null };
    expect(resolveBadgeProvider(prefs, 'grok')).toBe('kimi');
    expect(resolveBadgeProvider({ providerOrder: [], defaultProvider: null }, 'grok')).toBeNull();
  });
});
