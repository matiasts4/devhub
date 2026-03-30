import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeProfileName } from '../../src/utils/geminiProfiles.js';

describe('sanitizeProfileName', () => {
  it('should return the same string if valid', () => {
    assert.strictEqual(sanitizeProfileName('valid-Profile_123'), 'valid-Profile_123');
  });

  it('should strip path traversal characters', () => {
    assert.strictEqual(sanitizeProfileName('../profile'), 'profile');
    assert.strictEqual(sanitizeProfileName('..\\profile'), 'profile');
  });

  it('should strip command injection characters', () => {
    assert.strictEqual(sanitizeProfileName('profile; rm -rf /'), 'profilerm-rf');
    assert.strictEqual(sanitizeProfileName('profile&whoami'), 'profilewhoami');
    assert.strictEqual(sanitizeProfileName('`whoami`'), 'whoami');
  });

  it('should strip spaces', () => {
    assert.strictEqual(sanitizeProfileName('my profile'), 'myprofile');
  });

  it('should throw if the resulting string is empty', () => {
    assert.throws(() => sanitizeProfileName('!@#$'), { message: 'Invalid profile name' });
    assert.throws(() => sanitizeProfileName(''), { message: 'Invalid profile name' });
  });

  it('should throw if input is not a string', () => {
    assert.throws(() => sanitizeProfileName(null), { message: 'Profile name must be a string' });
    assert.throws(() => sanitizeProfileName(123), { message: 'Profile name must be a string' });
    assert.throws(() => sanitizeProfileName({}), { message: 'Profile name must be a string' });
  });
});
