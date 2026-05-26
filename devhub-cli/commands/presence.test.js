'use strict';

describe('presence.js', () => {
  it('should export presence command', () => {
    const presenceCommand = require('./presence');
    expect(typeof presenceCommand).toBe('function');
  });

  // NOTE: Integration tests require running API server
  // These tests verify the command structure only
});
