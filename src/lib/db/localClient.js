/* eslint-disable */
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const isCloud =
  process.env.NEXT_PUBLIC_DEVHUB_AUTH_PROVIDER === 'supabase' ||
  process.env.NEXT_PUBLIC_DEVHUB_DB_DRIVER === 'supabase' ||
  (typeof window !== 'undefined' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

let supabaseInstance = null;

function _shouldQuerySupabase(table) {
  if (typeof window === 'undefined') return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  // Check if authenticated
  if (!window.__devhub_authenticated) return false;

  // Global tenant tables are always synced/queried from Supabase if authenticated
  if (table === 'workspaces' || table === 'workspace_members') {
    return true;
  }

  // Active workspace must be non-local
  const activeWorkspaceId = localStorage.getItem('devhub:active-workspace-id');
  if (activeWorkspaceId && activeWorkspaceId !== 'local-ws') {
    return true;
  }

  return false;
}

/**
 * DevHub Local DB Client (CLIENT-SIDE ONLY)
 *
 * Query builder that talks to local SQLite via /api/db/* routes.
 * Drop-in compatible with Supabase-style chains: .from().select().eq()
 * (API surface mimics Supabase for easy migration — all queries hit local SQLite)
 *
 * Usage:
 *   import { createClient } from '@/lib/db/localClient';
 *   const db = createClient();
 *   const { data } = await db.from('tasks').select('*').eq('project_id', id);
 */

// ── Client-side query builder (uses fetch to API routes) ──────────────────────

function extractErrorMessage(input, fallback) {
  if (typeof input === 'string' && input.trim()) {
    return input;
  }

  if (input instanceof Error && typeof input.message === 'string' && input.message.trim()) {
    return input.message;
  }

  if (input && typeof input === 'object') {
    if (typeof input.message === 'string' && input.message.trim()) {
      return input.message;
    }

    if (typeof input.error === 'string' && input.error.trim()) {
      return input.error;
    }

    if (input.error && typeof input.error === 'object') {
      const nestedMessage = extractErrorMessage(input.error, '');
      if (nestedMessage) {
        return nestedMessage;
      }
    }
  }

  return fallback;
}

function normalizeClientError(input, fallbackMessage, extras = {}) {
  const error = {
    message: extractErrorMessage(input, fallbackMessage),
  };

  if (input instanceof Error && input.name) {
    error.name = input.name;
  }

  if (extras.status) {
    error.status = extras.status;
  }

  if (extras.statusText) {
    error.statusText = extras.statusText;
  }

  return error;
}

async function readErrorPayload(response) {
  const contentType = response.headers?.get?.('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text().catch(() => '');
  return text ? { error: text } : null;
}

async function buildResponseError(response, fallbackMessage) {
  const payload = await readErrorPayload(response).catch(() => null);
  return normalizeClientError(payload, fallbackMessage, {
    status: response.status,
    statusText: response.statusText,
  });
}

class LocalQueryClient {
  constructor(table) {
    this.table = table;
    this._select = '*';
    this._where = [];
    this._orderBy = [];
    this._limitVal = null;
    this._action = null;
    this._actionData = null;
    this._single = false;
  }

  select(fields) {
    if (typeof fields === 'string') {
      this._select =
        fields === '*'
          ? '*'
          : fields
              .split(',')
              .map((f) => f.trim())
              .join(', ');
    }
    return this;
  }

  eq(col, val) {
    this._where.push({ op: 'eq', col, val });
    return this;
  }

  neq(col, val) {
    this._where.push({ op: 'neq', col, val });
    return this;
  }

  in(col, vals) {
    this._where.push({ op: 'in', col, val: vals || [] });
    return this;
  }

  lt(col, val) {
    this._where.push({ op: 'lt', col, val });
    return this;
  }

  lte(col, val) {
    this._where.push({ op: 'lte', col, val });
    return this;
  }

  gt(col, val) {
    this._where.push({ op: 'gt', col, val });
    return this;
  }

  gte(col, val) {
    this._where.push({ op: 'gte', col, val });
    return this;
  }

  not(col, operator, val) {
    this._where.push({ op: 'not', col, operator, val });
    return this;
  }

  order(col, { ascending = true } = {}) {
    this._orderBy.push({ col, ascending });
    return this;
  }

  limit(n) {
    this._limitVal = n;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  // For count queries
  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    if (_shouldQuerySupabase(this.table)) {
      const supabase = getSupabaseInstance();
      if (supabase) {
        try {
          const { data, error } = await this._buildSupabaseQuery(supabase);
          if (!error) {
            this._cacheLocally(data);
            return { data, error: null };
          }
          console.warn('Supabase query failed, falling back to local SQLite:', error);
        } catch (err) {
          console.warn('Supabase exception, falling back to local SQLite:', err);
        }
      }
    }
    return this._executeLocalQuery();
  }

  async _executeLocalQuery() {
    try {
      const params = new URLSearchParams();
      params.set('table', this.table);
      params.set('select', this._select);

      if (this._where.length > 0) {
        params.set('where', JSON.stringify(this._where));
      }
      if (this._orderBy.length > 0) {
        params.set('orderBy', JSON.stringify(this._orderBy));
      }
      if (this._limitVal) {
        params.set('limit', String(this._limitVal));
      }

      const response = await fetch(`/api/db/query?${params.toString()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        return { data: null, error: await buildResponseError(response, 'Query failed') };
      }

      let data = await response.json();
      if (this._single && Array.isArray(data) && data.length > 0) {
        data = data[0];
      }
      return { data, error: null };
    } catch (error) {
      return { data: null, error: normalizeClientError(error, 'Query failed') };
    }
  }

  _buildSupabaseQuery(supabase) {
    let query = supabase.from(this.table);

    if (this._action === 'insert') {
      query = query.insert(this._actionData);
      if (this._select) query = query.select(this._select);
    } else if (this._action === 'update') {
      query = query.update(this._actionData);
      if (this._select) query = query.select(this._select);
    } else if (this._action === 'upsert') {
      query = query.upsert(this._actionData);
      if (this._select) query = query.select(this._select);
    } else if (this._action === 'delete') {
      query = query.delete();
      if (this._select) query = query.select(this._select);
    } else {
      query = query.select(this._select);
    }

    for (const w of this._where) {
      if (w.op === 'eq') {
        query = query.eq(w.col, w.val);
      } else if (w.op === 'neq') {
        query = query.neq(w.col, w.val);
      } else if (w.op === 'in') {
        query = query.in(w.col, w.val);
      } else if (w.op === 'lt') {
        query = query.lt(w.col, w.val);
      } else if (w.op === 'lte') {
        query = query.lte(w.col, w.val);
      } else if (w.op === 'gt') {
        query = query.gt(w.col, w.val);
      } else if (w.op === 'gte') {
        query = query.gte(w.col, w.val);
      } else if (w.op === 'not') {
        query = query.not(w.col, w.operator, w.val);
      }
    }

    for (const o of this._orderBy) {
      query = query.order(o.col, { ascending: o.ascending });
    }

    if (this._limitVal) {
      query = query.limit(this._limitVal);
    }

    if (this._single) {
      query = query.single();
    }

    return query;
  }

  async _cacheLocally(data) {
    if (!data) return;
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      try {
        fetch('/api/db/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: this.table,
            action: 'upsert',
            data: item,
          }),
        }).catch(() => {});
      } catch {
        // ignore
      }
    }
  }

  // For insert/update/delete - returns a chainable builder
  insert(data) {
    this._action = 'insert';
    this._actionData = data;
    return this;
  }

  update(data) {
    this._action = 'update';
    this._actionData = data;
    return this;
  }

  upsert(data) {
    this._action = 'upsert';
    this._actionData = data;
    return this;
  }

  delete() {
    this._action = 'delete';
    return this;
  }

  async _executeMutation() {
    const localResult = await this._executeLocalMutation();

    if (_shouldQuerySupabase(this.table) && localResult.error === null) {
      const supabase = getSupabaseInstance();
      if (supabase) {
        try {
          const { error } = await this._buildSupabaseQuery(supabase);
          if (error) {
            console.error('Supabase sync mutation error:', error);
          }
        } catch (err) {
          console.warn('Supabase sync mutation exception (offline):', err);
        }
      }
    }

    return localResult;
  }

  async _executeLocalMutation() {
    try {
      const response = await fetch('/api/db/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: this.table,
          action: this._action,
          data: this._actionData,
          where: this._where,
        }),
      });

      if (!response.ok) {
        return {
          data: null,
          error: await buildResponseError(response, `${this._action} failed`),
        };
      }

      let result = await response.json();
      if (this._single && Array.isArray(result) && result.length > 0) {
        result = result[0];
      }
      return { data: result, error: null };
    } catch (error) {
      return {
        data: null,
        error: normalizeClientError(error, `${this._action} failed`),
      };
    }
  }
}

// Override then to handle mutations
const originalThen = LocalQueryClient.prototype.then;
LocalQueryClient.prototype.then = function (resolve, reject) {
  if (this._action) {
    return this._executeMutation().then(resolve, reject);
  }
  return originalThen.call(this, resolve, reject);
};

// Add catch() for full Promise compatibility (Supabase API parity)
LocalQueryClient.prototype.catch = function (reject) {
  return this.then(undefined, reject);
};

// Add finally() for full Promise compatibility
LocalQueryClient.prototype.finally = function (onSettled) {
  return this.then(
    (result) => {
      onSettled?.();
      return result;
    },
    (error) => {
      onSettled?.();
      throw error;
    }
  );
};

// ── Auth stub (no auth needed for local) ──────────────────────────────────────

const localAuth = {
  async getSession() {
    return {
      data: {
        session: {
          user: {
            id: 'local-user',
            email: 'local@devhub.local',
          },
        },
      },
      error: null,
    };
  },

  async getUser() {
    return {
      data: {
        user: {
          id: 'local-user',
          email: 'local@devhub.local',
        },
      },
      error: null,
    };
  },

  async signInWithPassword() {
    return {
      data: {
        user: {
          id: 'local-user',
          email: 'local@devhub.local',
        },
        session: { access_token: 'local' },
      },
      error: null,
    };
  },

  async signInWithOtp({ email }) {
    return {
      data: { status: 'sent' },
      error: null,
    };
  },

  async verifyOtp({ email, token, type }) {
    return {
      data: {
        session: {
          access_token: 'local',
          user: {
            id: 'local-user',
            email: email || 'local@devhub.local',
          },
        },
        user: {
          id: 'local-user',
          email: email || 'local@devhub.local',
        },
      },
      error: null,
    };
  },

  async setSession(session) {
    return {
      data: { session },
      error: null,
    };
  },

  async signOut() {
    return { error: null };
  },

  onAuthStateChange(_callback) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  },
};

// ── Realtime stub (no realtime for local, use polling) ────────────────────────

const localRealtime = {
  channel(_name) {
    const handlers = [];
    const state = {};
    return {
      on(event, filter, callback) {
        handlers.push({ event, filter, callback });
        return this;
      },
      subscribe(callback) {
        if (callback) callback('SUBSCRIBED');
        handlers.forEach((h) => {
          if (h.event === 'presence' && h.filter?.event === 'sync') {
            h.callback();
          }
        });
        return this;
      },
      async track(payload) {
        state[payload.user_id || 'local-user'] = [payload];
        handlers.forEach((h) => {
          if (h.event === 'presence' && h.filter?.event === 'sync') {
            h.callback();
          }
        });
        return { error: null };
      },
      presenceState() {
        return state;
      },
      unsubscribe() {
        return this;
      },
    };
  },
  removeChannel(_channel) {},
};

// ── Client factory ────────────────────────────────────────────────────────────

function getSupabaseInstance() {
  if (isCloud) {
    if (!supabaseInstance) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && anonKey) {
        supabaseInstance = createSupabaseClient(url, anonKey);
      } else {
        console.error('Supabase credentials missing in NEXT_PUBLIC_ variables');
      }
    }
    return supabaseInstance;
  }
  return null;
}

export function createClient() {
  const supabase = getSupabaseInstance();

  return {
    from(table) {
      return new LocalQueryClient(table);
    },
    auth: supabase ? supabase.auth : localAuth,
    realtime: supabase ? supabase : localRealtime,
    channel(name) {
      if (supabase) {
        return supabase.channel(name);
      }
      return localRealtime.channel(name);
    },
    removeChannel(channel) {
      if (supabase) {
        return supabase.removeChannel(channel);
      }
      localRealtime.removeChannel(channel);
    },
  };
}
