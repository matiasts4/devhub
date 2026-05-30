'use client';

/**
 * useOperatorActions.js — Execution card state machine and dispatch hook.
 *
 * Coordinates: contract validation → confirmation gate → adapter execution → timeline write.
 *
 * State machine:
 *   (idle)
 *     dispatchAction()
 *       │
 *       ▼
 *   [requested] ── confirmCard ──► [dispatched] ──► [completed]
 *         │                               │
 *         └── cancelCard ──► [cancelled]  [failed] (on adapter throw)
 *
 * No transition is valid from completed, failed, or cancelled (terminal states).
 * No auto-retry. A new action requires a new dispatchAction + confirmation cycle.
 */

import { useCallback, useRef, useState } from 'react';
import { validateAction } from '@/lib/operator/actionContract';
import { writeTimelineEntry } from '@/lib/operator/actionTimeline';
import { terminalAdapter } from '@/lib/operator/adapters/terminal';
import { browserAdapter } from '@/lib/operator/adapters/browser';
import { dockAdapter } from '@/lib/operator/adapters/dock';

/** Static adapter lookup — no dynamic require. */
const ADAPTERS = {
  'terminal.open': terminalAdapter,
  'terminal.focus': terminalAdapter,
  'browser.open': browserAdapter,
  'browser.navigate': browserAdapter,
  'browser.focus': browserAdapter,
  'dock.switch_tab': dockAdapter,
};

function makeCardId() {
  return crypto.randomUUID();
}

function ts() {
  return Date.now();
}

/**
 * @param {{ onDockStateChange?: (updater: object|((prev: object) => object)) => void }} opts
 * @returns {{
 *   cards: Array,
 *   dispatchAction: (verb: string, params?: object, target?: string) => string|null,
 *   confirmCard: (cardId: string) => Promise<void>,
 *   cancelCard: (cardId: string) => void,
 * }}
 */
export default function useOperatorActions({ onDockStateChange } = {}) {
  const [cards, setCards] = useState([]);
  // Keep a ref so confirmCard doesn't need onDockStateChange in its dep array
  const onDockStateChangeRef = useRef(onDockStateChange);
  onDockStateChangeRef.current = onDockStateChange;

  /** Write a timeline entry helper */
  const log = useCallback((actionId, event, actor, detail = null) => {
    writeTimelineEntry({
      id: crypto.randomUUID(),
      actionId,
      event,
      timestamp: ts(),
      actor,
      detail,
    });
  }, []);

  /**
   * Main dispatch entry point — called by operator code or TerminalWorkspacesManager.
   *
   * Validates the action. If valid, creates a card in [requested] state and logs
   * a 'requested' timeline entry. Returns the new cardId, or null if validation failed.
   */
  const dispatchAction = useCallback(
    (verb, params = {}, target = 'right-dock') => {
      const result = validateAction({ verb, params, target });
      if (!result.valid) {
        console.warn('[operator] action rejected:', result.error, { verb });
        return null;
      }

      const cardId = makeCardId();
      /** @type {import('@/lib/operator/actionContract').ExecutionCard} */
      const card = {
        id: cardId,
        verb,
        params,
        target,
        tier: result.tier,
        status: 'requested',
        createdAt: ts(),
        confirmedAt: null,
        completedAt: null,
        result: null,
        error: null,
      };

      setCards((prev) => [card, ...prev]);
      log(cardId, 'requested', 'operator', { verb, params, target });

      return cardId;
    },
    [log]
  );

  /**
   * Called when human clicks Confirm inside the card.
   *
   * Transitions the card to [dispatched], writes 'confirmed' + 'dispatched' timeline entries,
   * awaits the adapter, then transitions to [completed] or [failed].
   * For `dock.switch_tab`, calls `onDockStateChange` after a successful adapter result.
   * Idempotent: re-confirming an already-dispatched card is a no-op.
   */
  const confirmCard = useCallback(
    async (cardId) => {
      let card;

      setCards((prev) =>
        prev.map((c) => {
          if (c.id !== cardId) return c;
          if (c.status !== 'requested') return c; // idempotent: skip non-requested cards
          card = { ...c, status: 'dispatched', confirmedAt: ts() };
          return card;
        })
      );

      if (!card) return; // card not found or already processed

      log(card.id, 'confirmed', 'human', null);
      log(card.id, 'dispatched', 'operator', null);

      try {
        const adapter = ADAPTERS[card.verb];
        const result = await adapter(card);

        // Wire dock.switch_tab to onDockStateChange
        if (
          card.verb === 'dock.switch_tab' &&
          result?.data?.tabId &&
          onDockStateChangeRef.current
        ) {
          onDockStateChangeRef.current((prev) => ({ ...prev, activeTab: result.data.tabId }));
        }

        setCards((prev) =>
          prev.map((c) =>
            c.id === cardId ? { ...c, status: 'completed', completedAt: ts(), result } : c
          )
        );
        log(card.id, 'completed', 'operator', result);
      } catch (err) {
        const errorMessage = err?.message ?? String(err);
        setCards((prev) =>
          prev.map((c) =>
            c.id === cardId ? { ...c, status: 'failed', completedAt: ts(), error: errorMessage } : c
          )
        );
        log(card.id, 'failed', 'operator', { error: errorMessage });
      }
    },
    [log]
  );

  /**
   * Called when human clicks Cancel inside the card.
   *
   * Transitions the card to [cancelled] without calling the adapter.
   */
  const cancelCard = useCallback(
    (cardId) => {
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, status: 'cancelled', completedAt: ts() } : c))
      );
      log(cardId, 'cancelled', 'human', null);
    },
    [log]
  );

  return { cards, dispatchAction, confirmCard, cancelCard };
}
