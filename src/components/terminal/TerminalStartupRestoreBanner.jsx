import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { buildStartupRestoreBannerMessage } from '@/lib/terminal/startupRestoreProgress';

function TerminalStartupRestoreBanner({ progress = null }) {
  const message = buildStartupRestoreBannerMessage(progress);
  const isVisible = Boolean(progress && message);
  const isDone = progress?.status === 'done';
  const completed = Number(progress?.completed) || 0;
  const total = Number(progress?.total) || 0;
  const progressRatio = total > 0 ? Math.min(1, completed / total) : null;

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          key="terminal-startup-restore-banner"
          data-testid="terminal-startup-restore-banner"
          data-status={progress?.status || 'unknown'}
          data-phase={progress?.phase || 'none'}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute bottom-4 left-1/2 z-[80] w-[min(92vw,440px)] -translate-x-1/2"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="rounded-xl border border-[rgba(var(--accent-rgb,88,166,255),0.28)] bg-[rgba(8,13,22,0.94)] px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <div className="flex items-center gap-3">
              {isDone ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-emerald-400"
                  data-testid="terminal-startup-restore-banner-icon-done"
                />
              ) : progress?.phase === 'discovering' ? (
                <RotateCcw
                  className="h-4 w-4 shrink-0 animate-spin text-[rgb(var(--accent-rgb,88,166,255))]"
                  data-testid="terminal-startup-restore-banner-icon-discovering"
                />
              ) : (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin text-[rgb(var(--accent-rgb,88,166,255))]"
                  data-testid="terminal-startup-restore-banner-icon-running"
                />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium text-[rgba(241,245,249,0.95)]"
                  data-testid="terminal-startup-restore-banner-message"
                >
                  {message}
                </p>
                {!isDone && total > 0 ? (
                  <p className="mt-0.5 text-[11px] text-[rgba(148,163,184,0.85)]">
                    {completed} de {total} completadas
                  </p>
                ) : null}
              </div>
            </div>
            {!isDone && progressRatio !== null ? (
              <div
                className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10"
                data-testid="terminal-startup-restore-banner-progress"
              >
                <motion.div
                  className="h-full rounded-full bg-[rgb(var(--accent-rgb,88,166,255))]"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(progressRatio * 100)}%` }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                />
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default TerminalStartupRestoreBanner;
