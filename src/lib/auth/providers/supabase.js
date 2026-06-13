'use strict';

/**
 * Supabase AuthProvider adapter.
 *
 * Lazy-loads `@supabase/supabase-js` and `@supabase/ssr` so that the
 * self-hosted / local-dev modes do not require these deps at install.
 * The adapter only activates when the env explicitly requests it.
 *
 * All failures surface as typed envelope errors (REQ-AUTH-4). Boot
 * fails closed if `SUPABASE_URL` is unset (REQ-AUTH-3).
 */

const { ConfigError, SessionExpiredError, NetworkError, envelopeError } = require('../errors.js');

function createSupabaseAuthProvider(options = {}) {
  const env = options.env || process.env;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new ConfigError('SUPABASE_URL is required when DEVHUB_AUTH_PROVIDER=supabase');
  }
  const anonKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new ConfigError('SUPABASE_ANON_KEY is required when DEVHUB_AUTH_PROVIDER=supabase');
  }

  // Lazy require so the supabase SDK is only loaded when this adapter
  // is selected. This keeps the local-mode bundle small and avoids
  // requiring the package in environments that never go to cloud.
  let client = options.client;
  if (!client) {
    let createClient;
    try {
      ({ createClient } = require('@supabase/supabase-js'));
    } catch {
      throw new ConfigError(
        'DEVHUB_AUTH_PROVIDER=supabase requires the @supabase/supabase-js package (npm i @supabase/supabase-js)'
      );
    }
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return {
    kind: 'supabase',

    async signInWithMagicLink({ email }) {
      if (!email) {
        return envelopeError(new ConfigError('email is required'));
      }
      try {
        const { data, error } = await client.auth.signInWithOtp({ email });
        if (error) {
          return envelopeError(new NetworkError(error.message));
        }
        return { ok: true, status: data?.status || 'sent' };
      } catch (err) {
        return envelopeError(new NetworkError(err.message));
      }
    },

    async signUpWithMagicLink({ email }) {
      if (!email) {
        return envelopeError(new ConfigError('email is required'));
      }
      try {
        const { data, error } = await client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true },
        });
        if (error) {
          return envelopeError(new NetworkError(error.message));
        }
        return { ok: true, status: data?.status || 'sent' };
      } catch (err) {
        return envelopeError(new NetworkError(err.message));
      }
    },

    async signOut() {
      try {
        const { error } = await client.auth.signOut();
        if (error) {
          return envelopeError(new NetworkError(error.message));
        }
        return { ok: true };
      } catch (err) {
        return envelopeError(new NetworkError(err.message));
      }
    },

    async getSession() {
      try {
        const { data, error } = await client.auth.getSession();
        if (error) {
          return null;
        }
        const session = data?.session;
        if (!session) return null;
        return {
          user: { id: session.user.id, email: session.user.email },
          workspaceMemberships: [],
        };
      } catch {
        return null;
      }
    },

    async verifyToken(token) {
      try {
        const { data, error } = await client.auth.getUser(token);
        if (error || !data?.user) {
          throw new SessionExpiredError(error?.message || 'token rejected');
        }
        return {
          user: { id: data.user.id, email: data.user.email },
          workspaceMemberships: [],
        };
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        throw new SessionExpiredError(err.message);
      }
    },

    async getAccessToken() {
      try {
        const { data } = await client.auth.getSession();
        return data?.session?.access_token || null;
      } catch {
        return null;
      }
    },

    onAuthStateChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          cb(null);
          return;
        }
        cb({
          user: { id: session.user.id, email: session.user.email },
          workspaceMemberships: [],
        });
      });
      return () => {
        try {
          data?.subscription?.unsubscribe();
        } catch {
          /* ignore */
        }
      };
    },
  };
}

module.exports = {
  createSupabaseAuthProvider,
};
