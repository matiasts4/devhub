/**
 * opencodeSessionRegistry.test.js — TDD tests for Phase 7 durable opencode sessions.
 */

import {
  OPENCODE_SESSION_TYPE,
  applyOpencodeDurableMetadata,
  buildOpencodeResumeCommand,
  getOpencodeSession,
  isOpencodeDurableSession,
  listOpencodeSessions,
  parseOpenCodeSessionIdFromCommand,
  registerOpencodeSession,
  resetOpencodeSessionRegistryForTests,
  shouldSkipBackendRestore,
  unregisterOpencodeSession,
} from '../opencodeSessionRegistry.js';

beforeEach(() => {
  resetOpencodeSessionRegistryForTests();
});

describe('parseOpenCodeSessionIdFromCommand', () => {
  it('extracts session id from opencode --session spawn command', () => {
    expect(parseOpenCodeSessionIdFromCommand('opencode --session ses_abc123')).toBe('ses_abc123');
    expect(parseOpenCodeSessionIdFromCommand('opencode --session oc-reboot-1 #recovery-42')).toBe(
      'oc-reboot-1'
    );
  });

  it('returns null for non-opencode commands', () => {
    expect(parseOpenCodeSessionIdFromCommand('bash -c "echo hello"')).toBeNull();
    expect(parseOpenCodeSessionIdFromCommand('opencode')).toBeNull();
  });
});

describe('isOpencodeDurableSession', () => {
  it('returns true when opencodeSessionId is present', () => {
    expect(isOpencodeDurableSession({ opencodeSessionId: 'ses_abc' })).toBe(true);
  });

  it('returns true when sessionType is opencode-durable', () => {
    expect(isOpencodeDurableSession({ sessionType: OPENCODE_SESSION_TYPE })).toBe(true);
  });

  it('returns false for pty-durable and shell-ephemeral sessions', () => {
    expect(isOpencodeDurableSession({ ptyPid: 12345 })).toBe(false);
    expect(isOpencodeDurableSession({ cwd: '/tmp', shell: '/bin/zsh' })).toBe(false);
  });
});

describe('shouldSkipBackendRestore', () => {
  it('skips backend PTY restore for opencode-durable sessions', () => {
    expect(shouldSkipBackendRestore({ opencodeSessionId: 'ses_xyz' })).toBe(true);
    expect(shouldSkipBackendRestore({ ptyPid: 99999 })).toBe(false);
  });
});

describe('applyOpencodeDurableMetadata', () => {
  it('marks session opencode-durable when spawn command includes --session id', () => {
    const result = applyOpencodeDurableMetadata(
      { id: 'p1', ptyPid: 4242 },
      { initialCommand: 'opencode --session oc-startup-e2e' }
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'p1',
        ptyPid: 4242,
        opencodeSessionId: 'oc-startup-e2e',
        sessionType: OPENCODE_SESSION_TYPE,
        skipBackendRestore: true,
        durableRestore: true,
        initialCommand: 'opencode --session oc-startup-e2e',
      })
    );
  });

  it('returns session unchanged when no durable opencode id is known', () => {
    const session = { id: 'p2', initialCommand: 'opencode' };
    expect(applyOpencodeDurableMetadata(session)).toBe(session);
  });
});

describe('buildOpencodeResumeCommand', () => {
  it('prefers normalized panel initialCommand when present', () => {
    expect(
      buildOpencodeResumeCommand({
        initialCommand: 'opencode --session oc-reboot-1 #recovery-9',
      })
    ).toBe('opencode --session oc-reboot-1');
  });

  it('falls back to opencode --session <id> when only session id is known', () => {
    expect(buildOpencodeResumeCommand({ opencodeSessionId: 'oc-fallback' })).toBe(
      'opencode --session oc-fallback'
    );
  });
});

describe('registerOpencodeSession', () => {
  it('registers terminalId -> opencodeSessionId mapping from spawn command', () => {
    const entry = registerOpencodeSession('term-1', {
      initialCommand: 'opencode --session ses_registry_1',
    });

    expect(entry).toEqual(
      expect.objectContaining({
        terminalId: 'term-1',
        opencodeSessionId: 'ses_registry_1',
        initialCommand: 'opencode --session ses_registry_1',
      })
    );
    expect(getOpencodeSession('term-1')).toEqual(entry);
    expect(listOpencodeSessions()).toHaveLength(1);
  });

  it('replaces prior registration for the same terminal id', () => {
    registerOpencodeSession('term-1', { opencodeSessionId: 'oc-old' });
    registerOpencodeSession('term-1', { opencodeSessionId: 'oc-new' });

    expect(getOpencodeSession('term-1')?.opencodeSessionId).toBe('oc-new');
    expect(listOpencodeSessions()).toHaveLength(1);
  });

  it('returns null when terminal id or session id is missing', () => {
    expect(registerOpencodeSession(null, { opencodeSessionId: 'oc-1' })).toBeNull();
    expect(registerOpencodeSession('term-1', { initialCommand: 'bash' })).toBeNull();
  });

  it('unregisters durable sessions on panel close', () => {
    registerOpencodeSession('term-1', { opencodeSessionId: 'oc-close' });
    expect(unregisterOpencodeSession('term-1')).toBe(true);
    expect(getOpencodeSession('term-1')).toBeNull();
  });
});
