'use strict';

/**
 * ExecuteDialog — Tier 3 rationale-confirmation dialog.
 *
 * Shows action label, target, params, and a rationale textarea.
 * Execute button disabled when rationale.length < 10.
 * 60-second countdown; auto-closes and calls onCancel() at 0.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useState, useEffect } from 'react';

const TIMER_SECONDS = 60;
const MIN_RATIONALE = 10;

/**
 * @param {{ pending: object, onConfirm: function, onCancel: function }} props
 */
export default function ExecuteDialog({ pending, onConfirm, onCancel }) {
  const { actionDef, params, target } = pending;
  const [rationale, setRationale] = useState('');
  const [countdown, setCountdown] = useState(TIMER_SECONDS);

  // Countdown timer — resets on rationale change and expires at 0
  useEffect(() => {
    if (rationale.length < MIN_RATIONALE) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          onCancel();
          return TIMER_SECONDS;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [rationale, onCancel]);

  const canExecute = rationale.trim().length >= MIN_RATIONALE;
  const charCount = rationale.length;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{actionDef.label} (requires confirmation)</DialogTitle>
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
            <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-40 font-mono">
              {JSON.stringify(params || {}, null, 2)}
            </pre>
          </div>
          <div className="space-y-1">
            <label htmlFor="rationale" className="text-sm font-medium">
              Reason for this action
            </label>
            <textarea
              id="rationale"
              rows={3}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Describe why you are performing this action (min. 10 characters)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{charCount} / 10 min</span>
              <span className={countdown <= 10 ? 'text-destructive font-medium' : ''}>
                {countdown}s remaining
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!canExecute}
            onClick={() =>
              onConfirm({ confirmed: true, confirmed_at: new Date().toISOString(), rationale })
            }
          >
            Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
