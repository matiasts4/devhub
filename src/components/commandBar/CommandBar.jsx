/**
 * CommandBar — Natural language command palette for DevHub.
 * 
 * Keyboard shortcut: Cmd+Shift+K (Mac) or Ctrl+Shift+K (Windows/Linux)
 * Slice 1: Terminal-run only (types command, spawns/focuses terminal)
 * 
 * Architecture:
 * - cmdk CommandDialog for accessible command palette UI
 * - Radix Dialog for modal overlay and focus trap
 * - framer-motion for smooth entrance/exit animations
 * - IntentRouter classifies user input
 * - dispatchAction executes actions via SurfaceController
 * 
 * @module components/commandBar/CommandBar
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Command } from 'cmdk';
import { useCommandBar } from '@/lib/commandBar/useCommandBar';
import { isCommandBarEnabled } from '@/lib/commandBar/featureFlag';
import { createRuleIntentRouter } from '@/lib/commandBar/intent/ruleIntentRouter';
import { dispatchAction } from '@/lib/commandBar/actions/dispatchAction';

/**
 * CommandBar component.
 * 
 * @param {Object} props
 * @param {import('@/lib/commandBar/types').SurfaceController} props.surfaceController
 */
export default function CommandBar({ surfaceController }) {
  // Call all hooks FIRST (before any conditional returns)
  const { isOpen, close } = useCommandBar();
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState(null); // { phase, message, error, result }
  const [intentRouter] = useState(() => createRuleIntentRouter());
  
  // Detect reduced motion preference
  const prefersReducedMotion = useReducedMotion();

  // Execute command when user presses Enter
  const handleSubmit = useCallback(
    async (value) => {
      if (!value.trim()) return;

      const trimmedValue = value.trim();
      
      // Classify intent
      const resolvedIntent = intentRouter.route(trimmedValue);
      
      // Dispatch action and track lifecycle
      try {
        for await (const actionStatus of dispatchAction(resolvedIntent, surfaceController)) {
          setStatus({
            phase: actionStatus.phase,
            message: actionStatus.message,
            error: actionStatus.error,
            surfaceId: actionStatus.surfaceId,
            result: actionStatus.result,
          });

          // Close on successful completion
          if (actionStatus.phase === 'done') {
            setTimeout(() => {
              close();
              setInputValue('');
              setStatus(null);
            }, 800);
          }
        }
      } catch (error) {
        setStatus({
          phase: 'failed',
          message: error.message,
          error: true,
        });
      }
    },
    [intentRouter, surfaceController, close]
  );

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setInputValue('');
      setStatus(null);
    }
  }, [isOpen]);

  // Determine if input should be disabled
  const isExecuting = status && (status.phase === 'queued' || status.phase === 'running');

  // Feature flag gate (checked after all hooks are called)
  if (!isCommandBarEnabled()) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <Command.Dialog
          open={isOpen}
          onOpenChange={close}
          label="Command Bar"
          shouldFilter={false}
          className="fixed inset-0 z-50"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
            className="fixed inset-0 bg-black/50"
            onClick={close}
          />

          {/* Command palette */}
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.95 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.95 }}
            transition={
              prefersReducedMotion
                ? { duration: 0.01 }
                : {
                    type: 'spring',
                    stiffness: 500,
                    damping: 30,
                  }
            }
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-2xl"
          >
            <div className="bg-popover border border-border rounded-lg shadow-2xl overflow-hidden">
              {/* Input */}
              <Command.Input
                value={inputValue}
                onValueChange={setInputValue}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit(inputValue);
                  } else if (e.key === 'Escape') {
                    close();
                  }
                }}
                placeholder="Type a command... (e.g., 'npm test' or 'run build')"
                className="w-full px-4 py-3 text-base bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
                autoFocus
                disabled={isExecuting}
                role="combobox"
                aria-expanded="true"
                aria-controls="commandbar-status"
              />

              {/* Status display with aria-live region */}
              {status && (
                <motion.div
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
                  id="commandbar-status"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className={`px-4 py-2 text-sm border-t border-border ${
                    status.error
                      ? 'bg-destructive/10 text-destructive'
                      : status.phase === 'done'
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={status.phase}
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                        transition={{ duration: prefersReducedMotion ? 0.01 : 0.14 }}
                      >
                        {status.phase === 'running' && (
                          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        )}
                        {status.phase === 'done' && (
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                        )}
                        {status.error && (
                          <div className="w-2 h-2 rounded-full bg-destructive" />
                        )}
                        {status.phase === 'queued' && (
                          <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                        )}
                      </motion.div>
                    </AnimatePresence>
                    <span>{status.message || `Status: ${status.phase}`}</span>
                  </div>

                  {/* Read-back panel for terminal-read results */}
                  {status.phase === 'done' && status.result && (
                    <motion.div
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
                      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1 }}
                      transition={{ duration: prefersReducedMotion ? 0.01 : 0.3, delay: prefersReducedMotion ? 0 : 0.1 }}
                      className="mt-3 space-y-2"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium">Terminal:</span>
                        <span className="text-muted-foreground">{status.result.terminalName}</span>
                        {status.result.fallbackUsed && (
                          <span className="text-yellow-600 dark:text-yellow-400">
                            (fallback from {status.result.requestedName})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(status.result.timestamp).toLocaleString()}</span>
                        {status.result.truncated && (
                          <span className="text-yellow-600 dark:text-yellow-400">
                            (truncated to last 1000 lines)
                          </span>
                        )}
                      </div>
                      {status.result.text ? (
                        <pre className="mt-2 p-3 bg-background/50 rounded border border-border text-xs font-mono overflow-auto max-h-40 whitespace-pre-wrap">
                          {status.result.text.length > 500
                            ? status.result.text.slice(0, 500) + '…'
                            : status.result.text}
                        </pre>
                      ) : (
                        <div className="mt-2 p-3 bg-background/50 rounded border border-border text-xs text-muted-foreground">
                          Terminal buffer is empty
                        </div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* Hints */}
              <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/50">
                <kbd className="px-1.5 py-0.5 rounded bg-background border border-border">Enter</kbd> to execute
                {' · '}
                <kbd className="px-1.5 py-0.5 rounded bg-background border border-border">Esc</kbd> to close
                {' · '}
                <kbd className="px-1.5 py-0.5 rounded bg-background border border-border">Cmd+Shift+K</kbd> to toggle
              </div>
            </div>
          </motion.div>
        </Command.Dialog>
      )}
    </AnimatePresence>
  );
}
