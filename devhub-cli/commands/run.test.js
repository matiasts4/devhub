'use strict';

describe('run.js', () => {
  it('should export run command', () => {
    const runCommand = require('./run');
    expect(typeof runCommand).toBe('function');
  });

  // NOTE: Integration tests require agent_runs table and localDb functions
  // These tests verify the command structure only
});
