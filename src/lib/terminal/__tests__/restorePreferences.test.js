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
