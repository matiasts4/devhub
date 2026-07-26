/**
 * restorePreferences.test.js - Unit tests for restore preferences module
 *
 * Phase 1 TDD: RED (test) → GREEN (implementation)
 */

const { JSDOM } = require('jsdom');

describe('restorePreferences', () => {
  beforeEach(() => {
    // Setup JSDOM environment for localStorage
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://devhub.test',
    });
    global.window = dom.window;
    global.localStorage = dom.window.localStorage;

    // Clear localStorage before each test
    localStorage.clear();

    // Reset module cache to get fresh module each time
    jest.resetModules();
  });

  afterEach(() => {
    if (global.window) {
      global.window.close();
    }
    delete global.window;
    delete global.localStorage;
  });

  // -------------------------------------------------------------------------
  // getDefaultRestorePolicy
  // -------------------------------------------------------------------------
  describe('getDefaultRestorePolicy', () => {
    it('should return "auto" for any session type', () => {
      const { getDefaultRestorePolicy } = restorePreferencesModule();
      expect(getDefaultRestorePolicy('opencode-durable')).toBe('auto');
      expect(getDefaultRestorePolicy('pty-durable')).toBe('auto');
      expect(getDefaultRestorePolicy('shell-ephemeral')).toBe('auto');
    });

    it('should return "auto" for null or undefined session type', () => {
      const { getDefaultRestorePolicy } = restorePreferencesModule();
      expect(getDefaultRestorePolicy(null)).toBe('auto');
      expect(getDefaultRestorePolicy(undefined)).toBe('auto');
    });

    it('should return "auto" for unknown session type strings', () => {
      const { getDefaultRestorePolicy } = restorePreferencesModule();
      expect(getDefaultRestorePolicy('unknown-type')).toBe('auto');
      expect(getDefaultRestorePolicy('another-type')).toBe('auto');
    });
  });

  // -------------------------------------------------------------------------
  // isRestoreAllowed
  // -------------------------------------------------------------------------
  describe('isRestoreAllowed', () => {
    it('should return true for "auto" policy', () => {
      const { isRestoreAllowed } = restorePreferencesModule();
      expect(isRestoreAllowed('auto')).toBe(true);
    });

    it('should return false for "off" policy', () => {
      const { isRestoreAllowed } = restorePreferencesModule();
      expect(isRestoreAllowed('off')).toBe(false);
    });

    it('should return false for "manual" policy', () => {
      const { isRestoreAllowed } = restorePreferencesModule();
      expect(isRestoreAllowed('manual')).toBe(false);
    });

    it('should return false for unknown policy values', () => {
      const { isRestoreAllowed } = restorePreferencesModule();
      expect(isRestoreAllowed('unknown')).toBe(false);
      expect(isRestoreAllowed('')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      const { isRestoreAllowed } = restorePreferencesModule();
      expect(isRestoreAllowed(null)).toBe(false);
      expect(isRestoreAllowed(undefined)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getPolicyLabel
  // -------------------------------------------------------------------------
  describe('getPolicyLabel', () => {
    it('should return "Automático" for "auto"', () => {
      const { getPolicyLabel } = restorePreferencesModule();
      expect(getPolicyLabel('auto')).toBe('Automático');
    });

    it('should return "Manual" for "manual"', () => {
      const { getPolicyLabel } = restorePreferencesModule();
      expect(getPolicyLabel('manual')).toBe('Manual');
    });

    it('should return "Desactivado" for "off"', () => {
      const { getPolicyLabel } = restorePreferencesModule();
      expect(getPolicyLabel('off')).toBe('Desactivado');
    });

    it('should return "Desconocido" for unknown policy values', () => {
      const { getPolicyLabel } = restorePreferencesModule();
      expect(getPolicyLabel('unknown')).toBe('Desconocido');
      expect(getPolicyLabel('')).toBe('Desconocido');
    });

    it('should return "Desconocido" for null or undefined', () => {
      const { getPolicyLabel } = restorePreferencesModule();
      expect(getPolicyLabel(null)).toBe('Desconocido');
      expect(getPolicyLabel(undefined)).toBe('Desconocido');
    });
  });

  // -------------------------------------------------------------------------
  // Multiprovider kinds + master restoreOnReboot switch
  // -------------------------------------------------------------------------
  describe('multiprovider kinds and restoreOnReboot', () => {
    it('exposes TERMINAL_RESTORE_KINDS with all verified providers', () => {
      const { TERMINAL_RESTORE_KINDS } = restorePreferencesModule();
      expect(TERMINAL_RESTORE_KINDS).toEqual([
        'opencode',
        'kimi',
        'grok',
        'codex',
        'qoder',
        'swarm',
        'generic',
      ]);
    });

    it('defaults every provider kind to auto and restoreOnReboot to true', () => {
      const { readTerminalRestorePreferences } = restorePreferencesModule();
      const prefs = readTerminalRestorePreferences(global.localStorage);
      expect(prefs).toEqual({
        opencode: 'auto',
        kimi: 'auto',
        grok: 'auto',
        codex: 'auto',
        qoder: 'auto',
        swarm: 'auto',
        generic: 'auto',
        restoreOnReboot: true,
      });
    });

    it('reads legacy 3-key JSON back-compatibly (missing kinds default, reboot switch on)', () => {
      const { readTerminalRestorePreferences, RESTORE_PREFERENCES_STORAGE_KEY } =
        restorePreferencesModule();
      global.localStorage.setItem(
        RESTORE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ opencode: 'manual', generic: 'off', swarm: 'auto' })
      );

      const prefs = readTerminalRestorePreferences(global.localStorage);
      expect(prefs.opencode).toBe('manual');
      expect(prefs.generic).toBe('off');
      expect(prefs.swarm).toBe('auto');
      expect(prefs.kimi).toBe('auto');
      expect(prefs.grok).toBe('auto');
      expect(prefs.codex).toBe('auto');
      expect(prefs.qoder).toBe('auto');
      expect(prefs.restoreOnReboot).toBe(true);
    });

    it('drops unknown keys while sanitizing', () => {
      const { readTerminalRestorePreferences, RESTORE_PREFERENCES_STORAGE_KEY } =
        restorePreferencesModule();
      global.localStorage.setItem(
        RESTORE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ kimi: 'manual', mystery: 'off', another: 1 })
      );

      const prefs = readTerminalRestorePreferences(global.localStorage);
      expect(prefs.kimi).toBe('manual');
      expect('mystery' in prefs).toBe(false);
      expect('another' in prefs).toBe(false);
    });

    it('persists an explicit restoreOnReboot=false and normalizes invalid values', () => {
      const { readTerminalRestorePreferences, RESTORE_PREFERENCES_STORAGE_KEY } =
        restorePreferencesModule();
      global.localStorage.setItem(
        RESTORE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ restoreOnReboot: false, kimi: 'bogus-policy' })
      );

      const prefs = readTerminalRestorePreferences(global.localStorage);
      expect(prefs.restoreOnReboot).toBe(false);
      expect(prefs.kimi).toBe('auto');
    });

    it('writeTerminalRestorePreferences merges provider kinds and the master switch', () => {
      const {
        readTerminalRestorePreferences,
        writeTerminalRestorePreferences,
        RESTORE_PREFERENCES_STORAGE_KEY,
      } = restorePreferencesModule();
      global.localStorage.setItem(
        RESTORE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ opencode: 'manual', generic: 'auto', swarm: 'auto' })
      );

      writeTerminalRestorePreferences(global.localStorage, { grok: 'off' });
      let prefs = readTerminalRestorePreferences(global.localStorage);
      expect(prefs.grok).toBe('off');
      expect(prefs.opencode).toBe('manual');
      expect(prefs.restoreOnReboot).toBe(true);

      writeTerminalRestorePreferences(global.localStorage, { restoreOnReboot: false });
      prefs = readTerminalRestorePreferences(global.localStorage);
      expect(prefs.restoreOnReboot).toBe(false);
      expect(prefs.grok).toBe('off');
    });

    it('isRebootRestoreEnabled is true unless explicitly disabled', () => {
      const { isRebootRestoreEnabled } = restorePreferencesModule();
      expect(isRebootRestoreEnabled({ restoreOnReboot: true })).toBe(true);
      expect(isRebootRestoreEnabled({ restoreOnReboot: false })).toBe(false);
      expect(isRebootRestoreEnabled({})).toBe(true);
      expect(isRebootRestoreEnabled(null)).toBe(true);
      expect(isRebootRestoreEnabled(undefined)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('getDefaultRestorePolicy should be a pure function with no side effects', () => {
      const { getDefaultRestorePolicy } = restorePreferencesModule();
      const result1 = getDefaultRestorePolicy('pty-durable');
      const result2 = getDefaultRestorePolicy('pty-durable');
      expect(result1).toBe(result2);
      expect(localStorage.length).toBe(0); // No side effects
    });

    it('isRestoreAllowed should be a pure function with no side effects', () => {
      const { isRestoreAllowed } = restorePreferencesModule();
      const result1 = isRestoreAllowed('auto');
      const result2 = isRestoreAllowed('auto');
      expect(result1).toBe(result2);
      expect(localStorage.length).toBe(0); // No side effects
    });

    it('getPolicyLabel should be a pure function with no side effects', () => {
      const { getPolicyLabel } = restorePreferencesModule();
      const result1 = getPolicyLabel('auto');
      const result2 = getPolicyLabel('auto');
      expect(result1).toBe(result2);
      expect(localStorage.length).toBe(0); // No side effects
    });
  });
});

// Helper to import modulefresh each time
function restorePreferencesModule() {
  return require('../../../lib/terminal/restorePreferences');
}
