'use strict';

/**
 * OperatorActionContext — React context for operator action dispatch.
 *
 * Exposes:
 *   actorRole        — current session role (obs | op | dir | sys)
 *   pendingAction    — current pending action awaiting confirmation, or null
 *   dispatchAction() — async, drives the full dispatch flow
 *   confirmAction()   — confirm pending action and re-dispatch
 *   cancelAction()    — cancel and emit DENIED audit
 *
 * Throws PolicyDeniedError / PolicyDeferredError for UI to catch and toast.
 */

import { createContext, useContext, useReducer, useCallback, useRef } from 'react';

// ── Custom error types ─────────────────────────────────────────────
export class PolicyDeniedError extends Error {
  constructor(error_detail) {
    super(error_detail);
    this.name = 'PolicyDeniedError';
    this.error_detail = error_detail;
  }
}

export class PolicyDeferredError extends Error {
  constructor(error_detail) {
    super(error_detail);
    this.name = 'PolicyDeferredError';
    this.error_detail = error_detail;
  }
}

// ── Initial state ──────────────────────────────────────────────────
const initialState = {
  pendingAction: null, // { actionId, actionDef, params, target, actorRole, actorSessionId }
};

// ── Reducer actions ────────────────────────────────────────────────
const ACTIONS = {
  SET_PENDING: 'SET_PENDING',
  CLEAR_PENDING: 'CLEAR_PENDING',
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_PENDING:
      return { ...state, pendingAction: action.payload };
    case ACTIONS.CLEAR_PENDING:
      return { ...state, pendingAction: null };
    default:
      return state;
  }
}

// ── Context ─────────────────────────────────────────────────────────
const OperatorActionContext = createContext(null);

// ── Provider ─────────────────────────────────────────────────────────
/**
 * @param {{ actorRole: string, actorSessionId: string, children: React.ReactNode }} props
 *
 * actorRole:       'obs' | 'op' | 'dir' | 'sys' — injected by parent (session context)
 * actorSessionId:  unique session id for audit trail
 */
export function OperatorActionProvider({ actorRole, actorSessionId, children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Use refs for values that need to be current in async callbacks
  const actorRoleRef = useRef(actorRole);
  const actorSessionIdRef = useRef(actorSessionId);

  // Keep refs current
  actorRoleRef.current = actorRole;
  actorSessionIdRef.current = actorSessionId;

  // Track pending action with a ref too (for confirmAction / cancelAction)
  const pendingRef = useRef(null);

  /**
   * Dispatch an action through the intent router / operator dispatch API.
   *
   * @param {{ action_id: string, params?: object, target?: object }} opts
   * @returns {Promise<any>} — resolves on PROCEED, throws on DENIED/DEFERRED
   */
  const dispatchAction = useCallback(async ({ action_id, params = {}, target = null }) => {
    const response = await fetch('/api/operator/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_id,
        params,
        target,
        actor_role: actorRoleRef.current,
        actor_session_id: actorSessionIdRef.current,
        confirmation: null,
        devhub_version: '0.1.0',
      }),
    });

    const result = await response.json();

    switch (result.status) {
      case 'PROCEED':
        return result.result;

      case 'CONFIRM_REQUIRED': {
        // Set pending action and return a promise that waits for confirm/cancel.
        // The parent must render OperatorConfirmDialog using the pendingAction from context.
        const pending = {
          actionId: action_id,
          actionDef: { tier: result.tier },
          params,
          target,
          actorRole: actorRoleRef.current,
          actorSessionId: actorSessionIdRef.current,
        };
        pendingRef.current = pending;
        dispatch({ type: ACTIONS.SET_PENDING, payload: pending });

        // Return a promise that resolves when confirmAction or cancelAction is called.
        // The resolve/reject are stored on the pending object itself.
        return new Promise((resolve, reject) => {
          pendingRef.current = { ...pending, _resolve: resolve, _reject: reject };
          dispatch({ type: ACTIONS.SET_PENDING, payload: pendingRef.current });
        });
      }

      case 'DENIED':
        throw new PolicyDeniedError(result.error_detail);

      case 'DEFERRED':
        throw new PolicyDeferredError(result.error_detail);

      case 'NAVIGATE_RESTRICTED':
        throw new PolicyDeniedError('restricted pane');

      default:
        throw new PolicyDeferredError(result.error_detail || 'Unexpected dispatch result');
    }
  }, []); // No deps — uses refs

  /**
   * Confirm and re-dispatch the pending action.
   * @param {{ confirmed: true, confirmed_at: string, rationale?: string }} receipt
   */
  const confirmAction = useCallback(async (receipt) => {
    const pending = pendingRef.current;
    if (!pending) return;

    // Clear pending immediately (prevents double-confirm)
    pendingRef.current = null;
    dispatch({ type: ACTIONS.CLEAR_PENDING });

    const response = await fetch('/api/operator/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_id: pending.actionId,
        params: pending.params,
        target: pending.target,
        actor_role: actorRoleRef.current,
        actor_session_id: actorSessionIdRef.current,
        confirmation: receipt,
        devhub_version: '0.1.0',
      }),
    });

    const result = await response.json();

    switch (result.status) {
      case 'PROCEED':
        if (pending._resolve) pending._resolve(result.result);
        return result.result;

      case 'DENIED':
        if (pending._reject) pending._reject(new PolicyDeniedError(result.error_detail));
        throw new PolicyDeniedError(result.error_detail);

      case 'DEFERRED':
        if (pending._reject) pending._reject(new PolicyDeferredError(result.error_detail));
        throw new PolicyDeferredError(result.error_detail);

      default:
        if (pending._reject)
          pending._reject(new PolicyDeferredError(result.error_detail || 'Unexpected result'));
        throw new PolicyDeferredError(result.error_detail || 'Unexpected re-dispatch result');
    }
  }, []);

  /**
   * Cancel the pending action (emits DENIED audit).
   */
  const cancelAction = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    dispatch({ type: ACTIONS.CLEAR_PENDING });

    if (pending?._reject) {
      pending._reject(new PolicyDeniedError('cancelled by user'));
    }

    if (!pending) return;

    // Emit DENIED audit (fire-and-forget)
    fetch('/api/operator/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_id: pending.actionId,
        params: pending.params,
        target: pending.target,
        actor_role: actorRoleRef.current,
        actor_session_id: actorSessionIdRef.current,
        confirmation: null,
        devhub_version: '0.1.0',
      }),
    }).catch(() => {}); // Best-effort
  }, []);

  const value = {
    actorRole,
    actorSessionId: actorSessionIdRef.current,
    pendingAction: state.pendingAction,
    dispatchAction,
    confirmAction,
    cancelAction,
  };

  return <OperatorActionContext.Provider value={value}>{children}</OperatorActionContext.Provider>;
}

// ── Hook ────────────────────────────────────────────────────────────
export function useOperatorAction() {
  const ctx = useContext(OperatorActionContext);
  if (!ctx) {
    throw new Error('useOperatorAction must be used within <OperatorActionProvider>');
  }
  return ctx;
}
