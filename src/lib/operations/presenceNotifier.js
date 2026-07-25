import { createAgentPresenceEvent } from '@/lib/operations/contracts';
import { dispatchOperationalNotification } from '@/lib/operations/notify';

export const PRESENCE_STATES = {
  OFFLINE: 'offline',
  IDLE: 'idle',
  RUNNING: 'running',
  BLOCKED: 'blocked',
  WAITING: 'waiting',
  FAILED: 'error',
  COMPLETED: 'completed',
};

const DEFAULT_STALLED_TIMEOUT_MS = 30 * 1000; // 30s
const DEFAULT_FAILED_TIMEOUT_MS = 60 * 1000; // 60s
const DEFAULT_CHECK_INTERVAL_MS = 5 * 1000; // 5s

export class PresenceNotifier {
  constructor({
    storage = null,
    stalledTimeoutMs = DEFAULT_STALLED_TIMEOUT_MS,
    failedTimeoutMs = DEFAULT_FAILED_TIMEOUT_MS,
    checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
    dispatchFn = dispatchOperationalNotification,
  } = {}) {
    this.storage = storage;
    this.stalledTimeoutMs = stalledTimeoutMs;
    this.failedTimeoutMs = failedTimeoutMs;
    this.checkIntervalMs = checkIntervalMs;
    this.dispatchFn = dispatchFn;

    this.agentRegistry = new Map();
    this.timer = null;
  }

  updatePresence(agentId, newState, statusSummary = '', metadata = {}, options = {}) {
    if (!agentId) return null;

    const prev = this.agentRegistry.get(agentId);
    const prevState = prev ? prev.state : PRESENCE_STATES.OFFLINE;
    const lastSeenAt =
      options.lastSeenAt ||
      (options.preserveLastSeen && prev?.lastSeenAt ? prev.lastSeenAt : Date.now());

    const currentRecord = {
      agentId,
      state: newState,
      statusSummary: statusSummary || prev?.statusSummary || '',
      lastSeenAt,
      metadata: { ...prev?.metadata, ...metadata },
    };

    this.agentRegistry.set(agentId, currentRecord);

    if (prevState !== newState) {
      this.handleStateTransition(agentId, prevState, newState, currentRecord);
    }

    return currentRecord;
  }

  handleStateTransition(agentId, prevState, newState, record) {
    const event = createAgentPresenceEvent({
      agentId,
      newState,
      prevState,
      statusSummary: record.statusSummary,
      missionId: record.metadata?.missionId || null,
    });

    this.dispatchFn(event, { storage: this.storage });
  }

  evaluateHeartbeats() {
    const now = Date.now();

    for (const [agentId, record] of this.agentRegistry.entries()) {
      if (record.state === PRESENCE_STATES.RUNNING || record.state === PRESENCE_STATES.BLOCKED) {
        const elapsed = now - record.lastSeenAt;

        if (elapsed >= this.failedTimeoutMs && record.state !== PRESENCE_STATES.FAILED) {
          this.updatePresence(
            agentId,
            PRESENCE_STATES.FAILED,
            'Timeout de latido excedido (>60s)',
            {},
            { preserveLastSeen: true }
          );
        } else if (elapsed >= this.stalledTimeoutMs && record.state === PRESENCE_STATES.RUNNING) {
          this.updatePresence(
            agentId,
            PRESENCE_STATES.BLOCKED,
            'Sin latido reciente (>30s)',
            {},
            { preserveLastSeen: true }
          );
        }
      }
    }
  }

  startMonitor() {
    if (this.timer) return;
    this.timer = setInterval(() => this.evaluateHeartbeats(), this.checkIntervalMs);
  }

  stopMonitor() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getMonitoredAgents() {
    return Array.from(this.agentRegistry.values());
  }
}
