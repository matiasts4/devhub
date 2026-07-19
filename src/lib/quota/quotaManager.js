class QuotaManager {
  constructor() {
    /** @type {Map<string, any>} */
    this.cache = new Map();
    /** @type {Set<Function>} */
    this.subscribers = new Set();
    this.pollIntervalMs = 45000; // 45 seconds polling
    this.timer = null;
    this.isPolling = false;
  }

  /**
   * Subscribe to quota updates
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.getAllQuotas());

    if (!this.isPolling && this.subscribers.size > 0) {
      this.startPolling();
    }

    return () => {
      this.subscribers.delete(callback);
      if (this.subscribers.size === 0) {
        this.stopPolling();
      }
    };
  }

  startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    this.fetchAll();
    this.timer = setInterval(() => this.fetchAll(), this.pollIntervalMs);
  }

  stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isPolling = false;
  }

  /**
   * Fetch quota for a single provider from backend API
   * @param {string} providerId
   */
  async fetchProvider(providerId) {
    try {
      const res = await fetch(`/api/quota?provider=${encodeURIComponent(providerId)}`);
      if (res.ok) {
        const status = await res.json();
        this.cache.set(providerId, status);
        this.notifySubscribers();
        return status;
      }
      return null;
    } catch (err) {
      console.warn(`[QuotaManager] Error fetching ${providerId}:`, err);
      return null;
    }
  }

  /**
   * Fetch all providers from backend API
   */
  async fetchAll() {
    try {
      const res = await fetch('/api/quota');
      if (res.ok) {
        const allQuotas = await res.json();
        for (const [key, val] of Object.entries(allQuotas)) {
          this.cache.set(key, val);
        }
        this.notifySubscribers();
        return allQuotas;
      }
    } catch (err) {
      console.warn('[QuotaManager] Error fetching all quotas:', err);
    }
    return this.getAllQuotas();
  }

  getQuota(providerId) {
    return this.cache.get(providerId) || null;
  }

  getAllQuotas() {
    const result = {};
    for (const [key, val] of this.cache.entries()) {
      result[key] = val;
    }
    return result;
  }

  notifySubscribers() {
    const all = this.getAllQuotas();
    for (const sub of this.subscribers) {
      try {
        sub(all);
      } catch (err) {
        console.error('[QuotaManager] Subscriber error:', err);
      }
    }
  }
}

export const quotaManager = new QuotaManager();
