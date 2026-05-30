'use strict';

/**
 * actionTimeline.js — Ephemeral immutable timeline for action lifecycle events.
 *
 * v1: entries are stored in a module-level array (in-memory only).
 * A future phase will flush entries to the observability / WAL table.
 * Entries are append-only — once written they are never mutated.
 */

/** @type {Array<{id: string, actionId: string, event: string, timestamp: number, actor: 'human'|'operator', detail: object|null}>} */
const _store = [];

/**
 * Write one immutable timeline entry.
 *
 * @param {{ id?: string, actionId: string, event: string, timestamp?: number, actor: 'human'|'operator', detail?: object|null }} entry
 */
export function writeTimelineEntry(entry) {
  _store.push({
    ...entry,
    id: entry.id || crypto.randomUUID(),
    timestamp: entry.timestamp || Date.now(),
  });
}

/**
 * Read all timeline entries for a given actionId.
 *
 * @param {string} actionId
 * @returns {Array}
 */
export function readTimelineEntries(actionId) {
  return _store.filter((e) => e.actionId === actionId);
}
