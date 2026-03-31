/**
 * Local Supabase-compatible client (CLIENT-SIDE ONLY)
 *
 * Drop-in replacement for @supabase/supabase-js client.
 * Uses fetch to talk to /api/db/* routes.
 *
 * Usage:
 *   import { createClient } from '@/lib/db/localSupabase';
 *   const supabase = createClient();
 *   const { data } = await supabase.from('tasks').select('*').eq('project_id', id);
 */

// ── Client-side query builder (uses fetch to API routes) ──────────────────────

class LocalQueryClient {
  constructor(table) {
    this.table = table;
    this._select = '*';
    this._where = [];
    this._orderBy = [];
    this._limitVal = null;
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

  order(col, { ascending = true } = {}) {
    this._orderBy.push({ col, ascending });
    return this;
  }

  limit(n) {
    this._limitVal = n;
    return this;
  }

  // For count queries
  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
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
      const error = await response.json().catch(() => ({}));
      return { data: null, error: { message: error.error || 'Query failed' } };
    }

    const data = await response.json();
    return { data, error: null };
  }

  // For insert/update/delete
  async insert(data) {
    const response = await fetch('/api/db/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: this.table,
        action: 'insert',
        data,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { data: null, error: { message: error.error || 'Insert failed' } };
    }

    const result = await response.json();
    return { data: result, error: null };
  }

  async update(data) {
    const response = await fetch('/api/db/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: this.table,
        action: 'update',
        data,
        where: this._where,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { data: null, error: { message: error.error || 'Update failed' } };
    }

    const result = await response.json();
    return { data: result, error: null };
  }

  async upsert(data) {
    const response = await fetch('/api/db/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: this.table,
        action: 'upsert',
        data,
        where: this._where,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { data: null, error: { message: error.error || 'Upsert failed' } };
    }

    const result = await response.json();
    return { data: result, error: null };
  }

  async delete() {
    const response = await fetch('/api/db/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: this.table,
        action: 'delete',
        where: this._where,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { data: null, error: { message: error.error || 'Delete failed' } };
    }

    const result = await response.json();
    return { data: result, error: null };
  }
}

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
    return {
      on(_event, _filter, _callback) {
        return this;
      },
      subscribe(_callback) {
        if (_callback) _callback('SUBSCRIBED');
        return this;
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
