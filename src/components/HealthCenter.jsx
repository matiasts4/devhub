import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, WifiOff } from 'lucide-react';
import {
  formatFreshnessLabel,
  getAuthorityLabel,
  getHealthStatusLabel,
  getHealthTone,
} from '@/lib/operations/presenters';

const toneConfig = {
  success: {
    icon: CheckCircle2,
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/5',
  },
  warning: {
    icon: AlertTriangle,
    text: 'text-amber-400',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/5',
  },
  danger: {
    icon: WifiOff,
    text: 'text-red-400',
    border: 'border-red-500/20',
    bg: 'bg-red-500/5',
  },
  muted: {
    icon: HelpCircle,
    text: 'text-text-muted',
    border: 'border-borders-subtle',
    bg: 'bg-surface-muted',
  },
};

function SourceCard({ source }) {
  const tone = getHealthTone(source.status);
  const config = toneConfig[tone] || toneConfig.muted;
  const Icon = config.icon;

  return (
    <article className={`rounded-xl border px-3 py-2.5 ${config.border} ${config.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">{source.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
            <span className={`inline-flex items-center gap-1 ${config.text}`}>
              <Icon className="h-3.5 w-3.5" />
              {getHealthStatusLabel(source.status)}
            </span>
            <span>{getAuthorityLabel(source.authority)}</span>
            <span>Freshness {formatFreshnessLabel(source.freshness_ms)}</span>
          </div>
        </div>
      </div>
      {source.status_reason ? (
        <p className="mt-2 text-xs text-text-muted">{source.status_reason}</p>
      ) : null}
    </article>
  );
}

export default function HealthCenter({ title = 'Estado operacional', sources = [] }) {
  return (
    <section className="rounded-2xl border border-borders-subtle bg-surface-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="text-xs text-text-muted">{sources.length} fuentes canónicas</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {sources.length === 0 ? (
          <p className="text-xs text-text-muted">Sin datos operacionales disponibles.</p>
        ) : (
          sources.map((source) => <SourceCard key={source.key} source={source} />)
        )}
      </div>
    </section>
  );
}
