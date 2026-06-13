'use strict';

const { redactSecrets } = require('../audit-emitter');

describe('audit-emitter.redactSecrets', () => {
  describe('redactSecrets', () => {
    it('redacts password fields', () => {
      const input = { session_id: 'abc', password: 'secret123' };
      const result = redactSecrets(input);
      expect(result.password).toBe('[REDACTED]');
      expect(result.session_id).toBe('abc');
    });

    it('redacts nested password fields', () => {
      const input = { user: { password: 'secret' } };
      const result = redactSecrets(input);
      expect(result.user.password).toBe('[REDACTED]');
    });

    it('redacts token fields', () => {
      const input = { api_token: 'tok_abc', value: 42 };
      const result = redactSecrets(input);
      expect(result.api_token).toBe('[REDACTED]');
      expect(result.value).toBe(42);
    });

    it('redacts secret fields', () => {
      const input = { secret: 'mysecret', name: 'test' };
      const result = redactSecrets(input);
      expect(result.secret).toBe('[REDACTED]');
      expect(result.name).toBe('test');
    });

    it('redacts key fields', () => {
      const input = { api_key: 'key_xyz', name: 'test' };
      const result = redactSecrets(input);
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.name).toBe('test');
    });

    it('redacts case-insensitively (Password)', () => {
      const input = { Password: 'Secret', apiKey: 'key_xyz' };
      const result = redactSecrets(input);
      expect(result.Password).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
    });

    it('redacts api_token nested inside object', () => {
      const input = { config: { api_token: 'tok_123' } };
      const result = redactSecrets(input);
      expect(result.config.api_token).toBe('[REDACTED]');
    });

    it('does not mutate original object', () => {
      const input = { password: 'secret', safe: 'value' };
      const result = redactSecrets(input);
      expect(result.password).toBe('[REDACTED]');
      expect(input.password).toBe('secret');
    });

    it('returns null as-is', () => {
      expect(redactSecrets(null)).toBeNull();
    });

    it('returns undefined as-is', () => {
      expect(redactSecrets(undefined)).toBeUndefined();
    });

    it('handles arrays', () => {
      const input = [{ password: 'a' }, { token: 'b' }];
      const result = redactSecrets(input);
      expect(result[0].password).toBe('[REDACTED]');
      expect(result[1].token).toBe('[REDACTED]');
    });

    it('does not redact fields that do not match patterns', () => {
      const input = { session_id: 'abc', name: 'test', type: 'mutate' };
      const result = redactSecrets(input);
      expect(result.session_id).toBe('abc');
      expect(result.name).toBe('test');
      expect(result.type).toBe('mutate');
    });

    it('redacts keys containing the word "key" (case-insensitive)', () => {
      const input = { Authorization: 'Bearer tok_123', content: 'hello' };
      const result = redactSecrets(input);
      expect(result.Authorization).toBe('Bearer tok_123'); // does not match /key/
    });
  });
});