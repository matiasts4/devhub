'use strict';

/**
 * ConfirmDialog — Tier 2 one-step confirmation.
 *
 * Shows action label, target, and params (secrets already redacted upstream).
 * "Cancel" emits DENIED audit and dismisses. "Confirm" calls onConfirm.
 * Closes on backdrop click or Escape key.
 */

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';

/**
 * @param {{ pending: object, onConfirm: function, onCancel: function }} props
 */
export default function ConfirmDialog({ pending, onConfirm, onCancel }) {
  const { actionDef, params, target } = pending;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{actionDef.label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {target && (
            <div className="flex gap-2">
              <span className="text-muted-foreground">Target:</span>
              <span className="font-medium">{target.label || `${target.type}:${target.id}`}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground mb-1 block">Parameters:</span>
            <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48 font-mono">
              {JSON.stringify(params || {}, null, 2)}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}