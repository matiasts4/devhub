'use client';

import StageTag from './StageTag.jsx';
import { StatusIcon } from './StatusIcon.jsx';
import AuthorityBadge from './AuthorityBadge.jsx';

/**
 * OperatorTimelineItem — renders a single timeline row (D-7, T12).
 *
 * Props:
 *   item: OperatorTimelineItem
 */
function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(isoString).toLocaleDateString();
}

export default function OperatorTimelineItem({ item }) {
  const hasError = item.error && (item.error.code || item.error.message);
  const isRedacted = item.redaction_level !== 'none';

  return (
    <div className="flex items-start gap-3 py-3 px-4 hover:bg-surface-elevated transition-colors border-b border-borders-subtle last:border-b-0">
      {/* Left gutter: StageTag + StatusIcon stacked */}
      <div className="flex flex-col items-center gap-1 pt-0.5 w-10 flex-shrink-0">
        <StageTag stage={item.stage} status={item.status} />
        <StatusIcon status={item.status} />
      </div>

      {/* Center: actor badge, tool name, next_step_hint */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono font-semibold text-text-primary">
            {item.actor.type}:{item.actor.id}
          </span>
          {item.tool && (
            <span className="text-xs font-mono text-text-muted bg-surface-elevated px-1.5 py-0.5 rounded border border-borders-strong">
              {item.tool}
            </span>
          )}
        </div>

        {/* next_step_hint */}
        {item.next_step_hint && (
          <p className="text-xs text-text-muted italic mb-1 truncate">
            → {item.next_step_hint}
          </p>
        )}

        {/* Redaction indicator */}
        {isRedacted && (
          <p className="text-[10px] text-text-muted italic">params hidden</p>
        )}

        {/* Error callout */}
        {hasError && (
          <div className="mt-2 p-2 rounded bg-red-50 border border-red-200">
            <p className="text-xs font-semibold text-red-700">
              {item.error.code || 'Error'} — {item.error.message}
            </p>
            {item.error.recoverable && (
              <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                Recoverable
              </span>
            )}
          </div>
        )}

        {/* evidence_refs */}
        {item.evidence_refs && item.evidence_refs.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.evidence_refs.map((ref) => (
              <code
                key={ref}
                className="text-[10px] font-mono text-text-muted bg-surface-elevated px-1 py-0.5 rounded border border-borders-strong"
              >
                {ref}
              </code>
            ))}
          </div>
        )}
      </div>

      {/* Right: relative timestamp + AuthorityBadge */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0 w-20">
        <span className="text-[11px] text-text-muted font-mono">
          {formatRelativeTime(item.occurred_at)}
        </span>
        {item.authority === 'secondary_hint' && <AuthorityBadge authority={item.authority} />}
      </div>
    </div>
  );
}