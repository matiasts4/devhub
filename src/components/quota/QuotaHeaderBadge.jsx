import { useState, useEffect } from 'react';
import { quotaManager } from '../../lib/quota/quotaManager.js';
import { detectProviderFromSession } from '../../lib/quota/activeSessionSensor.js';
import { PROVIDER_LABELS } from '../../lib/quota/types.js';
import { QuotaProgressRing } from './QuotaProgressRing.jsx';
import { QuotaInspectorPopover } from './QuotaInspectorPopover.jsx';

export function QuotaHeaderBadge({ activeSessionTitle = null }) {
  const [quotas, setQuotas] = useState({});
  const [activeProvider, setActiveProvider] = useState('grok');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Detect active provider from session title/command
    const detected = detectProviderFromSession(activeSessionTitle);
    setActiveProvider(detected);
  }, [activeSessionTitle]);

  useEffect(() => {
    // Subscribe to QuotaManager updates
    const unsubscribe = quotaManager.subscribe((updatedQuotas) => {
      setQuotas(updatedQuotas);
    });

    return () => unsubscribe();
  }, []);

  const currentQuota = quotas[activeProvider] || null;
  const remPct = currentQuota ? currentQuota.primaryRemainingPercent : 100;
  const label = PROVIDER_LABELS[activeProvider] || activeProvider;

  function formatShortReset(ms) {
    if (!ms || ms <= 0) return null;
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  const shortReset = currentQuota ? formatShortReset(currentQuota.timeUntilResetMs) : null;

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800/90 text-zinc-200 text-xs font-medium transition-all shadow-sm hover:border-zinc-700"
        title="Click to inspect AI subscription quotas"
      >
        <QuotaProgressRing percentage={remPct} size={15} strokeWidth={2.5} />
        <span className="font-semibold tracking-wide text-[11px] text-zinc-100">{label}</span>
        <span
          className={`text-[11px] font-bold ${remPct < 20 ? 'text-red-400' : remPct < 45 ? 'text-amber-400' : 'text-emerald-400'}`}
        >
          {remPct}%
        </span>
        {shortReset && (
          <span className="text-[10px] text-zinc-400 border-l border-zinc-700/60 pl-1.5 hidden sm:inline">
            ⏳ {shortReset}
          </span>
        )}
      </button>

      {isOpen && (
        <QuotaInspectorPopover
          allQuotas={quotas}
          selectedProvider={activeProvider}
          onSelectProvider={(id) => setActiveProvider(id)}
          onRefresh={() => quotaManager.fetchAll()}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
