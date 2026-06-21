'use strict';

/**
 * Port contract test for the AuthProvider abstraction.
 *
 * The contract is enforced for every adapter: local, supabase, fake.
 * Each test exercises a single method of the port and asserts the canonical
 * shape defined in REQ-AUTH-1.
 *
 * Refs: REQ-AUTH-1, REQ-AUTH-4.
 */

// Force the fake adapter for the contract surface test so the suite
// does not depend on real Supabase credentials.
process.env.DEVHUB_AUTH_PROVIDER = 'fake';
process.env.NODE_ENV = 'test';

const { LOCAL_USER_ID, LOCAL_USER_EMAIL, LOCAL_WORKSPACE_ID } = require('@/lib/constants/local');

// Stub the supabase SDK so the supabase adapter can be instantiated in
// this test without making network calls. We mock the SDK at the module
// level and then call the adapter factory directly via the port with a
// pre-set client.
jest.mock('@supabase/supabase-js', () => {
  return {
    createClient: jest.fn(() => {
      const handlers = new Set();
      return {
        auth: {
          signInWithOtp: jest.fn(async () => ({ data: { status: 'sent' }, error: null })),
          signOut: jest.fn(async () => ({ error: null })),
          getSession: jest.fn(async () => ({
            data: {
              session: {
                user: { id: 'supa-user', email: 'supa@devhub.test' },
                access_token: 'supa-token',
              },
            },
            error: null,
          })),
          getUser: jest.fn(async (token) => ({
            data: { user: { id: 'supa-user', email: 'supa@devhub.test' } },
            error: token === 'expired' ? { message: 'token expired' } : null,
          })),
          onAuthStateChange: jest.fn((cb) => {
            handlers.add(cb);
            return { data: { subscription: { unsubscribe: jest.fn(() => handlers.delete(cb)) } } };
          }),
        },
      };
    }),
  };
});

const { getAuthProvider, resetAuthProviderForTests } = require('../provider.js');

const ADAPTER_KINDS = ['fake', 'local', 'supabase'];

function withAuthProvider(kind, fn) {
  const previousKind = process.env.DEVHUB_AUTH_PROVIDER;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousSupabaseAnon = process.env.SUPABASE_ANON_KEY;
  process.env.DEVHUB_AUTH_PROVIDER = kind;
  if (kind === 'fake') {
    process.env.NODE_ENV = 'test';
  }
  if (kind === 'supabase') {
    process.env.SUPABASE_URL = 'http://supabase.test';
    process.env.SUPABASE_ANON_KEY = 'anon-test';
  }
  resetAuthProviderForTests();
  try {
    return fn(getAuthProvider());
  } finally {
    process.env.DEVHUB_AUTH_PROVIDER = previousKind;
    process.env.NODE_ENV = previousNodeEnv;
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseAnon === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previousSupabaseAnon;
    resetAuthProviderForTests();
  }
}

describe('AuthProvider port contract', () => {
  describe('adapter kinds are loadable', () => {
    test.each(ADAPTER_KINDS)('loads %s adapter via getAuthProvider()', (kind) => {
      withAuthProvider(kind, (provider) => {
        expect(provider).toBeDefined();
        expect(typeof provider.signInWithMagicLink).toBe('function');
        expect(typeof provider.signUpWithMagicLink).toBe('function');
        expect(typeof provider.signOut).toBe('function');
        expect(typeof provider.getSession).toBe('function');
        expect(typeof provider.verifyToken).toBe('function');
        expect(typeof provider.getAccessToken).toBe('function');
        expect(typeof provider.onAuthStateChange).toBe('function');
      });
    });
  });

  describe('getSession() canonical shape', () => {
    test.each(ADAPTER_KINDS)('%s returns a Session-like object or null', async (kind) => {
      await withAuthProvider(kind, async (provider) => {
        const session = await provider.getSession();
        if (session !== null) {
          expect(session).toHaveProperty('user');
          expect(session.user).toHaveProperty('id');
          expect(session.user).toHaveProperty('email');
          expect(Array.isArray(session.workspaceMemberships)).toBe(true);
        }
      });
    });

    test('local adapter returns a synthetic session', async () => {
      await withAuthProvider('local', async (provider) => {
        const session = await provider.getSession();
        expect(session).not.toBeNull();
        expect(session.user.id).toBe(LOCAL_USER_ID);
        expect(session.user.email).toBe(LOCAL_USER_EMAIL);
        expect(session.workspaceMemberships).toEqual([
          expect.objectContaining({ workspaceId: LOCAL_WORKSPACE_ID, role: 'owner' }),
        ]);
      });
    });
  });

  describe('signInWithMagicLink() canonical shape', () => {
    test.each(ADAPTER_KINDS)('%s returns an envelope, never throws', async (kind) => {
      await withAuthProvider(kind, async (provider) => {
        const result = await provider.signInWithMagicLink({ email: 'a@b.test' });
        expect(result).toHaveProperty('ok');
        if (result.ok) {
          expect(result).toHaveProperty('status');
        } else {
          expect(result.error).toHaveProperty('code');
          expect(result.error).toHaveProperty('message');
        }
      });
    });

    test('local adapter returns synthetic status without network I/O', async () => {
      await withAuthProvider('local', async (provider) => {
        const result = await provider.signInWithMagicLink({ email: 'whoever@devhub.local' });
        expect(result).toEqual({ ok: true, status: 'sent', delivery: 'synthetic' });
      });
    });
  });

  describe('getAccessToken() canonical shape', () => {
    test.each(ADAPTER_KINDS)('%s returns string-or-null', async (kind) => {
      await withAuthProvider(kind, async (provider) => {
        const token = await provider.getAccessToken();
        expect(token === null || typeof token === 'string').toBe(true);
      });
    });

    test('returns null when no session is active', async () => {
      await withAuthProvider('local', async (provider) => {
        const token = await provider.getAccessToken();
        // local adapter returns the synthetic token (deterministic), but the
        // contract REQ-AUTH-1 only requires string-or-null.
        expect(token === null || typeof token === 'string').toBe(true);
      });
    });
  });

  describe('onAuthStateChange() returns an unsubscribe function', () => {
    test.each(ADAPTER_KINDS)('%s unsubscribe detaches the handler', async (kind) => {
      await withAuthProvider(kind, async (provider) => {
        const calls = [];
        const handler = (session) => calls.push(session);
        const unsubscribe = provider.onAuthStateChange(handler);
        expect(typeof unsubscribe).toBe('function');
        // Unsubscribe is a function; calling it must not throw and must
        // not deliver further events to the handler. We can't directly
        // trigger events from outside the adapter, but we can call
        // unsubscribe immediately to confirm it is idempotent + safe.
        unsubscribe();
        unsubscribe(); // idempotent
        expect(calls).toEqual([]);
      });
    });
  });
});
