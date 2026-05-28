'use strict';

const { request } = require('../lib/httpClient');
const { deleteAuthFile } = require('../lib/auth');

describe('events.js', () => {
  beforeEach(() => {
    deleteAuthFile();
  });

  it('should export request function', () => {
    expect(typeof request).toBe('function');
  });

  it('should fail with clear error when not authenticated', async () => {
    await expect(
      request({
        url: 'http://localhost:3000/api/test',
        signed: true,
      })
    ).rejects.toThrow(/not authenticated/i);
  });
});

// NOTE: Full integration tests require a running API server
// These tests verify the command structure and error handling only
