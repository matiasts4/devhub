'use strict';
import ConfirmDialog from './ConfirmDialog.jsx';
import ExecuteDialog from './ExecuteDialog.jsx';

/**
 * Dialog Shell — routes to ConfirmDialog (Tier 2) or ExecuteDialog (Tier 3)
 * based on pendingAction.actionDef.tier.
 *
 * Returns null for Tier 0/1 or no pending action.
 */

/**
 * @param {{ pendingAction: object|null, onConfirm: function, onCancel: function }} props
 */
export default function OperatorConfirmDialog({ pendingAction, onConfirm, onCancel }) {
  if (!pendingAction) return null;

  const { tier } = pendingAction.actionDef;

  // No dialog for Tier 0/1
  if (tier < 2) return null;

  return tier === 2 ? (
    <ConfirmDialog pending={pendingAction} onConfirm={onConfirm} onCancel={onCancel} />
  ) : (
    <ExecuteDialog pending={pendingAction} onConfirm={onConfirm} onCancel={onCancel} />
  );
}
