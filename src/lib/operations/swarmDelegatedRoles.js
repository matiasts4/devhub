/**
 * Derive which SDD workers already received a delegate directive (bus snapshot).
 */

function isDelegateInboxBody(body) {
  const raw = String(body || '').trim();
  if (!raw) return false;
  if (!raw.startsWith('{')) {
    return /delegate|change|task_id/i.test(raw);
  }
  try {
    const parsed = JSON.parse(raw);
    return (
      parsed?.kind === 'delegate' ||
      Boolean(parsed?.change) ||
      Boolean(parsed?.task_id) ||
      Boolean(parsed?.instruction)
    );
  } catch {
    return false;
  }
}

function normalizeWorkerRoleKey(role) {
  const key = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  return /^sdd_worker_\d+$/.test(key) ? key : null;
}

/**
 * @param {object|null|undefined} snapshot — bus snapshot from getMissionBusSnapshot
 * @returns {Set<string>} role keys e.g. sdd_worker_1
 */
export function resolveSwarmDelegatedRoleKeys(snapshot) {
  const delegated = new Set();
  if (!snapshot || typeof snapshot !== 'object') return delegated;

  const inboxRows = [
    ...(Array.isArray(snapshot.inbox_pending) ? snapshot.inbox_pending : []),
    ...(Array.isArray(snapshot.inbox_recent_consumed) ? snapshot.inbox_recent_consumed : []),
  ];

  for (const row of inboxRows) {
    const role = normalizeWorkerRoleKey(row?.to_role);
    if (role && isDelegateInboxBody(row?.body)) {
      delegated.add(role);
    }
  }

  for (const evt of Array.isArray(snapshot.events_recent) ? snapshot.events_recent : []) {
    if (evt?.kind !== 'inbox_delivered') continue;
    let payload = evt?.payload_json;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = null;
      }
    }
    const role = normalizeWorkerRoleKey(payload?.to_role || payload?.toRole);
    if (role) delegated.add(role);
  }

  for (const chat of Array.isArray(snapshot.chat_recent) ? snapshot.chat_recent : []) {
    const role = normalizeWorkerRoleKey(chat?.to_role);
    if (!role) continue;
    if (isDelegateInboxBody(chat?.body) || chat?.kind === 'delegate') {
      delegated.add(role);
    }
  }

  return delegated;
}

/**
 * @param {object} panel
 * @param {Set<string>} delegatedRoleKeys
 * @returns {boolean}
 */
export function shouldShowSwarmStandbyOverlay(panel, delegatedRoleKeys) {
  if (!panel?.swarmContext?.standbyAwaitingDelegation) return false;
  const roleKey = normalizeWorkerRoleKey(panel?.swarmContext?.roleKey || panel?.swarmRole?.roleKey);
  if (!roleKey) return true;
  return !delegatedRoleKeys?.has?.(roleKey);
}
