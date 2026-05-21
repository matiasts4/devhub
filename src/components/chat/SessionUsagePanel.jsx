import TokenUsageBadge from '@/components/chat/TokenUsageBadge';
import { resolveContextUsage } from '@/lib/agenthub/contextUsage';

export default function SessionUsagePanel({ usage }) {
  const resolvedUsage = resolveContextUsage(usage || {});

  if (!resolvedUsage || resolvedUsage.total_tokens === 0) {
    return null;
  }

  return (
    <section
      className="px-3 py-2 border-b"
      style={{ background: 'var(--surface-card)', borderColor: 'var(--border-subtle)' }}
      aria-label="Uso de contexto de la sesión"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-primary)' }}
          >
            Uso de contexto
          </p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {new Intl.NumberFormat('en-US').format(resolvedUsage.total_tokens)} /{' '}
            {new Intl.NumberFormat('en-US').format(resolvedUsage.context_window_size)} tokens
          </p>
        </div>

        <TokenUsageBadge usage={resolvedUsage} />
      </div>
    </section>
  );
}
