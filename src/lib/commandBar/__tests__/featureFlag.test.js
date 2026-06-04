/**
 * @jest-environment node
 */

describe('CommandBar Feature Flag', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NEXT_PUBLIC_COMMANDBAR_ENABLED;
    jest.resetModules();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_COMMANDBAR_ENABLED = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_COMMANDBAR_ENABLED;
    }
  });

  test('returns true when flag is "true"', () => {
    process.env.NEXT_PUBLIC_COMMANDBAR_ENABLED = 'true';
    const { isCommandBarEnabled } = require('../featureFlag');
    expect(isCommandBarEnabled()).toBe(true);
  });

  test('returns false when flag is "false"', () => {
    process.env.NEXT_PUBLIC_COMMANDBAR_ENABLED = 'false';
    const { isCommandBarEnabled } = require('../featureFlag');
    expect(isCommandBarEnabled()).toBe(false);
  });

  test('returns false when flag is unset', () => {
    delete process.env.NEXT_PUBLIC_COMMANDBAR_ENABLED;
    const { isCommandBarEnabled } = require('../featureFlag');
    expect(isCommandBarEnabled()).toBe(false);
  });

  test('returns false for any value other than "true"', () => {
    process.env.NEXT_PUBLIC_COMMANDBAR_ENABLED = 'yes';
    const { isCommandBarEnabled } = require('../featureFlag');
    expect(isCommandBarEnabled()).toBe(false);
  });
});
