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

  // Override execute to handle mutations
  async _executeMutation() {
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
    (result) => { onSettled?.(); return result; },
    (error) => { onSettled?.(); throw error; }
  );
};

// ── Auth stub (no auth needed for local) ──────────────────────────────────────

const localAuth = {
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

export function createClient() {
  return {
    from(table) {
      return new LocalQueryClient(table);
    },
    auth: localAuth,
    realtime: localRealtime,
    channel(name) {
      return localRealtime.channel(name);
    },
    removeChannel(channel) {
      localRealtime.removeChannel(channel);
    },
  };
}
