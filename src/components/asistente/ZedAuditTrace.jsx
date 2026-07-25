'use client';

/** Format one audit tool row for the trace panel. */
function formatToolTrace(tool) {
  if (!tool?.tool) return '';
  const input = tool.input && typeof tool.input === 'object' ? tool.input : {};
  const parts = [tool.tool];
  if (input.name) parts.push(`name=${input.name}`);
  if (input.session_id) parts.push(`id=${input.session_id}`);
  if (input.program) parts.push(`program=${input.program}`);
  if (input.confirm === true) parts.push('confirm=true');
  const r = tool.result;
  if (tool?.tool === 'close_terminal' && r?.action === 'would close') {
    return `${parts.join(' ')} → preview (pendiente confirmación)`;
  }
  if (tool?.fast_path) return `${parts.join(' ')} → rápido (sin LLM)`;
  if (r?.action === 'would close') return `${parts.join(' ')} → preview (pendiente confirmación)`;
  if (r?.success === true) return `${parts.join(' ')} → ok`;
  if (r?.error) return `${parts.join(' ')} → error: ${r.error}`;
  if (r?.opened) return `${parts.join(' ')} → panel abierto`;
  return parts.join(' ');
}

/**
 * Shows what the user said vs what Zed executed (last turns).
 */
export default function ZedAuditTrace({ entries = [] }) {
  const recent = [...entries].slice(-5).reverse();
  if (recent.length === 0) return null;

  return (
    <div
      data-testid="zed-audit-trace"
      className="rounded-lg border border-[color-mix(in_srgb,var(--border-subtle)_90%,transparent)] bg-[color-mix(in_srgb,#0d1218_80%,transparent)] p-2"
    >
      <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Traza (decís → hace)
      </p>
      <ul className="space-y-2">
        {recent.map((entry, idx) => (
          <li
            key={entry.ts || idx}
            className="text-[10px] leading-snug text-[var(--text-secondary)]"
          >
            <span className="text-[var(--text-primary)]">Vos:</span>{' '}
            {entry.userMessage || '(sin mensaje)'}
            {Array.isArray(entry.tools) && entry.tools.length > 0 ? (
              <ul className="mt-1 space-y-0.5 pl-2 text-[var(--text-muted)]">
                {entry.tools.map((t, i) => (
                  <li key={i}>→ {formatToolTrace(t)}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 pl-2 text-[var(--text-muted)]">→ (sin tools)</p>
            )}
            {entry.assistantText ? (
              <p className="mt-0.5 pl-2 text-[var(--text-muted)]">
                Zed: {entry.assistantText.slice(0, 120)}
                {entry.assistantText.length > 120 ? '…' : ''}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { formatToolTrace };
