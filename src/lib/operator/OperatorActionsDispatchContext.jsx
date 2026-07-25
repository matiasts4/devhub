'use client';

/**
 * OperatorActionsDispatchContext — thin React context that exposes
 * useOperatorActions' dispatchAction (verb, params, target) to the full component tree.
 *
 * The adapter-based state machine lives in useOperatorActions.
 * This context lifts dispatchAction out so any component can call it without
 * needing a hook import or prop drilling.
 *
 * Usage:
 *   const { dispatchAction } = useOperatorActionsDispatch();
 *
 * Provider is mounted in App.js around <TerminalWorkspacesManager>.
 */

import { createContext, useContext } from 'react';
import useOperatorActions from '@/components/workspace/hooks/useOperatorActions';

const OperatorActionsDispatchContext = createContext(null);

/**
 * Provider that owns the useOperatorActions instance.
 * Renders ActionCardStack and wires confirm/cancel into the dock.
 *
 * @param {{ children: React.ReactNode, onDockStateChange?: Function }} props
 */
export function OperatorActionsDispatchProvider({ children, onDockStateChange }) {
  // Single shared instance — cards, confirmCard, cancelCard all live here
  const { cards, dispatchAction, confirmCard, cancelCard } = useOperatorActions({
    onDockStateChange,
  });

  const value = { dispatchAction, cards, confirmCard, cancelCard };

  return (
    <OperatorActionsDispatchContext.Provider value={value}>
      {children}
    </OperatorActionsDispatchContext.Provider>
  );
}

/**
 * @returns {{ dispatchAction: Function, cards: Array, confirmCard: Function, cancelCard: Function }}
 */
export function useOperatorActionsDispatch() {
  const ctx = useContext(OperatorActionsDispatchContext);
  if (!ctx) {
    throw new Error(
      'useOperatorActionsDispatch must be used inside <OperatorActionsDispatchProvider>'
    );
  }
  return ctx;
}
