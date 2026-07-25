import { Hourglass } from 'lucide-react';
import { QuotaProgressRing } from './QuotaProgressRing.jsx';
import { QuotaInspectorPopover } from './QuotaInspectorPopover.jsx';
import { useState, useEffect } from 'react';
import { quotaManager } from '../../lib/quota/quotaManager.js';
import { detectProviderFromSession } from '../../lib/quota/activeSessionSensor.js';
import { PROVIDER_LABELS } from '../../lib/quota/types.js';
import {
  QUOTA_PREFERENCES_EVENT,
  readQuotaPreferences,
  resolveBadgeProvider,
} from '../../lib/quota/quotaPreferences.js';

export function QuotaHeaderBadge({ activeSessionTitle = null }) {
  const [quotas, setQuotas] = useState({});
  const [prefs, setPrefs] = useState(() => readQuotaPreferences());
  const [detectedProvider, setDetectedProvider] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Detect active provider from session title/command
    setDetectedProvider(detectProviderFromSession(activeSessionTitle));
  }, [activeSessionTitle]);

  useEffect(() => {
    // Subscribe to QuotaManager updates
    const unsubscribe = quotaManager.subscribe((updatedQuotas) => {
      setQuotas(updatedQuotas);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail) setPrefs(event.detail);
    };
    window.addEventListener(QUOTA_PREFERENCES_EVENT, handler);
    return () => window.removeEventListener(QUOTA_PREFERENCES_EVENT, handler);
  }, []);

  const activeProvider = resolveBadgeProvider(prefs, detectedProvider);

  // A provider explicitly picked in the popover sticks for the rest of the
  // session (until it's disabled or another one is picked); the pinned
  // default / auto-detection only applies when there is no manual choice.
  const displayProvider =
    selectedProvider && prefs.providerOrder.includes(selectedProvider)
      ? selectedProvider
      : activeProvider;

  // No providers enabled → the badge hides itself entirely.
  if (!displayProvider) return null;

  const currentQuota = quotas[displayProvider] || null;
  // Only trust percentages backed by real usage windows; an errored or
  // window-less status must render as "no data", never as a fake 100%.
  const hasData = !!currentQuota && !currentQuota.error && currentQuota.windows?.length > 0;
  const remPct = hasData ? currentQuota.primaryRemainingPercent : null;
  const label = PROVIDER_LABELS[displayProvider] || displayProvider;

  function formatShortReset(ms) {
    if (!ms || ms <= 0) return null;
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  const shortReset = hasData ? formatShortReset(currentQuota.timeUntilResetMs) : null;
  const badgeTitle = hasData
    ? 'Click to inspect AI subscription quotas'
    : currentQuota?.error || 'Loading quota data…';

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800/90 text-zinc-200 text-xs font-medium transition-all shadow-sm hover:border-zinc-700"
        title={badgeTitle}
      >
        <QuotaProgressRing percentage={remPct ?? 0} size={15} strokeWidth={2.5} dimmed={!hasData} />
        <span className="font-semibold tracking-wide text-[11px] text-zinc-100">{label}</span>
        {hasData ? (
          <span
            className={`text-[11px] font-bold ${remPct < 20 ? 'text-red-400' : remPct < 45 ? 'text-amber-400' : 'text-emerald-400'}`}
          >
            {remPct}%
          </span>
        ) : (
          <span
            className="text-[11px] font-bold text-zinc-500"
            title={currentQuota?.error || undefined}
          >
            --
          </span>
        )}
        {shortReset && (
          <span className="text-[10px] text-zinc-400 border-l border-zinc-700/60 pl-1.5 hidden sm:inline-flex items-center gap-1">
            <Hourglass size={10} />
            {shortReset}
          </span>
        )}
      </button>

      {isOpen && (
        <QuotaInspectorPopover
          allQuotas={quotas}
          orderedProviders={prefs.providerOrder}
          selectedProvider={displayProvider}
          onSelectProvider={(id) => setSelectedProvider(id)}
          onRefresh={() => quotaManager.fetchAll(true)}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
