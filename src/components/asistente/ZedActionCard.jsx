'use client';

import { Terminal, Globe, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { buildZedAmbientStatus } from '@/lib/asistente/buildZedAmbientStatus';

function safeParse(v) {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function iconForTool(tool) {
  if (tool === 'open_url' || tool === 'close_url') return Globe;
  if (tool?.includes('terminal') || tool === 'summarize_terminal') return Terminal;
  return FileText;
}

/**
 * @param {object} props
 * @param {{ tool: string, result?: unknown, input?: object }} props.entry
 * @param {() => void} [props.onFocusTerminal]
 * @param {() => void} [props.onOpenUrl]
 * @param {() => void} [props.onRetry]
 */
export default function ZedActionCard({ entry, onFocusTerminal, onOpenUrl, onRetry }) {
  if (!entry?.tool) return null;
  const parsed = safeParse(entry.result);
  const isError = parsed?.error;
  const Icon = isError ? AlertCircle : iconForTool(entry.tool);
  const statusLine = buildZedAmbientStatus({
    role: 'assistant',
    content: '',
    tool_results: [entry],
  });

  const handleClick = () => {
    if (isError && onRetry) {
      onRetry();
      return;
    }
    if (entry.tool === 'open_terminal' && onFocusTerminal) onFocusTerminal(parsed);
    if (entry.tool === 'open_url' && onOpenUrl) onOpenUrl(parsed);
  };

  const clickable =
    isError ||
    entry.tool === 'open_terminal' ||
    entry.tool === 'open_url';

  return (
    <button
      type="button"
      onClick={clickable ? handleClick : undefined}
      className={[
        'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] transition-colors',
        isError
          ? 'border-[color-mix(in_srgb,var(--danger,#ef4444)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger,#ef4444)_8%,transparent)]'
          : 'border-[color-mix(in_srgb,var(--accent-primary)_18%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)]',
        clickable ? 'cursor-pointer hover:border-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)]' : 'cursor-default',
      ].join(' ')}
      aria-label={statusLine || entry.tool}
    >
      <Icon
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isError ? 'text-[var(--danger,#ef4444)]' : 'text-[var(--accent-primary)]'}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1 leading-snug text-[var(--text-secondary)]">
        {statusLine || entry.tool}
        {parsed?.displayName ? (
          <span className="ml-1 text-[var(--text-muted)]">({parsed.displayName})</span>
        ) : null}
      </span>
      {!isError ? (
        <CheckCircle2 className="h-3 w-3 shrink-0 text-[var(--accent-primary)] opacity-70" aria-hidden />
      ) : null}
    </button>
  );
}
