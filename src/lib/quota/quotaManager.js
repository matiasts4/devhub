import { fetchAnthropicQuota } from './providers/anthropic.js';
import { fetchGrokQuota } from './providers/grok.js';
import { fetchAntigravityQuota } from './providers/antigravity.js';
import { fetchKimiQuota } from './providers/kimi.js';
import { fetchCodexQuota } from './providers/codex.js';
import { fetchOpenCodeQuota } from './providers/opencode.js';
import { PROVIDERS } from './types.js';

class QuotaManager {
  constructor() {
    /** @type {Map<string, any>} */
    this.cache = new Map();
    /** @type {Set<Function>} */
    this.subscribers = new Set();
    this.pollIntervalMs = 45000; // 45 seconds polling
    this.timer = null;
    this.isPolling = false;

    this.adapters = {
      [PROVIDERS.CLAUDE]: fetchAnthropicQuota,
      [PROVIDERS.GROK]: fetchGrokQuota,
      [PROVIDERS.ANTIGRAVITY]: fetchAntigravityQuota,
      [PROVIDERS.KIMI]: fetchKimiQuota,
      [PROVIDERS.CODEX]: fetchCodexQuota,
      [PROVIDERS.OPENCODE]: fetchOpenCodeQuota,
    };
  }

  /**
   * Subscribe to quota updates
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    // Immediately emit current cache to new subscriber
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

  /**
   * Start periodic background polling
   */
  startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    this.fetchAll();
    this.timer = setInterval(() => this.fetchAll(), this.pollIntervalMs);
  }

  /**
   * Stop background polling
   */
  stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isPolling = false;
  }

  /**
   * Fetch quota for a single provider
   * @param {string} providerId
   */
  async fetchProvider(providerId) {
    const adapter = this.adapters[providerId];
    if (!adapter) return null;

    try {
      const status = await adapter();
      this.cache.set(providerId, status);
      this.notifySubscribers();
      return status;
    } catch (err) {
      console.warn(`[QuotaManager] Error fetching ${providerId}:`, err);
      return null;
    }
  }

  /**
   * Fetch all registered providers
   */
  async fetchAll() {
    const providerIds = Object.keys(this.adapters);
    await Promise.all(providerIds.map((id) => this.fetchProvider(id).catch(() => null)));
  }

  /**
   * Get quota status for a specific provider
   * @param {string} providerId
   */
  getQuota(providerId) {
    return this.cache.get(providerId) || null;
  }

  /**
   * Get map of all current quota statuses
   */
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
