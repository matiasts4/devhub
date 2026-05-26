'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  generateAgentSecret,
  hashToken,
  readAuthFile,
  writeAuthFile,
  deleteAuthFile,
} = require('../lib/auth');

const AUTH_FILE_PATH = path.join(os.homedir(), '.devhub', 'auth.json');

describe('auth.js', () => {
  beforeEach(() => {
    // Clean up auth file before each test
    deleteAuthFile();
  });

  afterEach(() => {
    // Clean up after tests
    deleteAuthFile();
  });

  it('should generate a 64-char hex secret', () => {
    const secret = generateAgentSecret();
    expect(secret.length).toBe(64);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should hash a secret', () => {
    const secret = 'a'.repeat(64);
    const hash = hashToken(secret);
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should write and read auth file', () => {
    const auth = {
      agent_id: 'test-agent',
      secret: 'secret123',
      workspace_id: 'ws-1',
      created_at: new Date().toISOString(),
    };

    writeAuthFile(auth);
    const read = readAuthFile();

    expect(read).toEqual(auth);
  });

  it('should return null when auth file does not exist', () => {
    const read = readAuthFile();
    expect(read).toBeNull();
  });

  it('should delete auth file', () => {
    const auth = {
      agent_id: 'test',
      secret: 'secret',
      workspace_id: null,
      created_at: new Date().toISOString(),
    };

    writeAuthFile(auth);
    expect(fs.existsSync(AUTH_FILE_PATH)).toBe(true);

    deleteAuthFile();
    expect(fs.existsSync(AUTH_FILE_PATH)).toBe(false);
  });

  it('should set 0600 permissions on auth file', () => {
    const auth = {
      agent_id: 'test',
      secret: 'secret',
      workspace_id: null,
      created_at: new Date().toISOString(),
    };

    writeAuthFile(auth);
    const stats = fs.statSync(AUTH_FILE_PATH);
    const mode = stats.mode & parseInt('777', 8);

    // 0600 = 384 in decimal
    expect(mode).toBe(parseInt('600', 8));
  });
});
