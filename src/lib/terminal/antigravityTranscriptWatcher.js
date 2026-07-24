/**
 * antigravityTranscriptWatcher — quiescence-based activity detection over
 * Antigravity transcript files (redundancy tier 2, kimi-watch pattern).
 *
 * Antigravity (terminal, CLI, and IDE) writes JSONL transcripts to:
 *   ~/.gemini/antigravity-ide/brain/<conversationId>/.system_generated/logs/transcript.jsonl
 * Every hook payload also carries `transcriptPath` directly.
 *
 * Signal: transcript file GROWING = agent active; growth stopped for ≥ idleMs
 * = agent finished its turn. This works even for IDE-embedded agents that
 * have no PTY to scrape.
 *
 * Implementation notes:
 *   - stat-based POLLING (fs.watch is unreliable on network drives / Windows
 *     subtrees and misses size-only changes on some platforms).
 *   - Handles: file not yet created (waits), truncation/rotation (size
 *     shrink resets the baseline), multiple concurrent watchers.
 *   - No module-level mutable state: each watchAntigravityTranscript() call
 *     returns its own unwatch() closure.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export const DEFAULT_TRANSCRIPT_IDLE_MS = 4000;
export const DEFAULT_TRANSCRIPT_POLL_MS = 2000;

/**
 * Resolve the default transcript path for a conversationId.
 */
export function resolveAntigravityTranscriptPath(conversationId, homeDir = os.homedir()) {
  return path.join(
    homeDir,
    '.gemini',
    'antigravity-ide',
    'brain',
    String(conversationId),
    '.system_generated',
    'logs',
    'transcript.jsonl'
  );
}

/**
 * Watch an Antigravity transcript file for activity via size-based polling.
 *
 * @param {object} options
 * @param {string} [options.conversationId] — resolved to the default brain path
 * @param {string} [options.transcriptPath] — explicit path (wins over conversationId)
 * @param {(info: {size:number, at:number}) => void} [options.onActivity] — fired on each growth
 * @param {(info: {size:number, at:number, idleMs:number}) => void} [options.onIdle] — fired once per quiet period
 * @param {number} [options.idleMs=4000] — quiet window before onIdle
 * @param {number} [options.pollMs=2000] — stat poll interval
 * @param {string} [options.homeDir] — home override (tests)
 * @returns {{ unwatch: () => void, getPath: () => string }}
 */
export function watchAntigravityTranscript({
  conversationId,
  transcriptPath,
  onActivity,
  onIdle,
  idleMs = DEFAULT_TRANSCRIPT_IDLE_MS,
  pollMs = DEFAULT_TRANSCRIPT_POLL_MS,
  homeDir,
} = {}) {
  const filePath =
    transcriptPath ||
    (conversationId ? resolveAntigravityTranscriptPath(conversationId, homeDir) : null);

  if (!filePath) {
    throw new Error('watchAntigravityTranscript: conversationId or transcriptPath is required');
  }

  let stopped = false;
  let timer = null;
  let lastSize = -1; // -1 = never seen; distinguishes "new file at 0 bytes"
  let lastGrowthAt = 0;
  let idleFired = false;

  function statSize() {
    try {
      const st = fs.statSync(filePath);
      return st.size;
    } catch {
      return null; // missing / unreadable — keep waiting
    }
  }

  function poll() {
    if (stopped) return;

    const now = Date.now();
    const size = statSize();

    if (size !== null) {
      if (lastSize === -1) {
        // First sighting of the file: treat existing content as baseline
        // activity only if non-empty (agent already mid-turn).
        lastSize = size;
        if (size > 0) {
          lastGrowthAt = now;
          idleFired = false;
          if (onActivity) onActivity({ size, at: now });
        }
      } else if (size > lastSize) {
        // Growth → activity.
        lastSize = size;
        lastGrowthAt = now;
        idleFired = false;
        if (onActivity) onActivity({ size, at: now });
      } else if (size < lastSize) {
        // Truncation / rotation → reset baseline, count as activity
        // (a fresh file means the agent started a new segment).
        lastSize = size;
        lastGrowthAt = now;
        idleFired = false;
        if (onActivity) onActivity({ size, at: now });
      }
    }

    // Quiescence check: had activity, quiet for ≥ idleMs, not yet notified.
    if (lastGrowthAt > 0 && !idleFired && now - lastGrowthAt >= idleMs) {
      idleFired = true;
      if (onIdle) {
        onIdle({ size: lastSize < 0 ? 0 : lastSize, at: now, idleMs });
      }
    }

    if (!stopped) {
      timer = setTimeout(poll, pollMs);
      // Never keep the event loop alive just for this watcher.
      if (timer && typeof timer.unref === 'function') timer.unref();
    }
  }

  // Kick off on next tick so callers can store the handle first.
  timer = setTimeout(poll, pollMs);
  if (timer && typeof timer.unref === 'function') timer.unref();

  return {
    unwatch() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    getPath() {
      return filePath;
    },
  };
}

/**
 * Registry for multiple concurrent transcript watchers keyed by an opaque
 * watch key (conversationId or path). Provides stop-all for server shutdown.
 */
export function createTranscriptWatcherRegistry() {
  const watchers = new Map();

  return {
    /** Start (or replace) a watcher; returns the watch handle. */
    watch(key, options) {
      if (watchers.has(key)) {
        watchers.get(key).unwatch();
      }
      const handle = watchAntigravityTranscript(options);
      watchers.set(key, handle);
      return handle;
    },
    unwatch(key) {
      const handle = watchers.get(key);
      if (handle) {
        handle.unwatch();
        watchers.delete(key);
      }
    },
    unwatchAll() {
      for (const handle of watchers.values()) {
        handle.unwatch();
      }
      watchers.clear();
    },
    size() {
      return watchers.size;
    },
    has(key) {
      return watchers.has(key);
    },
  };
}
