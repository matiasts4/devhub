import { RefreshCw, TriangleAlert, X } from 'lucide-react';
import { PROVIDER_LABELS } from '../../lib/quota/types.js';
import { QuotaProgressRing } from './QuotaProgressRing.jsx';

export function QuotaInspectorPopover({
  allQuotas = {},
  orderedProviders = null,
  selectedProvider = 'grok',
  onSelectProvider,
  onRefresh,
  onClose,
}) {
  const currentQuota = allQuotas[selectedProvider] || null;
  // Only enabled providers, in the user-configured order.
  const providerIds =
    Array.isArray(orderedProviders) && orderedProviders.length > 0
      ? orderedProviders
      : Object.keys(PROVIDER_LABELS);

  function formatTimeRemaining(ms) {
    if (!ms || ms <= 0) return 'Reset ready / No limit';
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h remaining`;
    }
    if (hours > 0) return `${hours}h ${mins}m remaining`;
    return `${mins}m remaining`;
  }

  return (
    <div
      data-devhub-modal="soft"
      data-devhub-soft-overlay="true"
      className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-zinc-800 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md z-50 text-zinc-100 font-sans text-xs"
    >
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar max-w-[200px]">
          {providerIds.map((id) => {
            const label = PROVIDER_LABELS[id] || id;
            const status = allQuotas[id];
            const isActive = id === selectedProvider;
            const isAvail = status?.isAvailable;

            return (
              <button
                key={id}
                onClick={() => onSelectProvider(id)}
                className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap text-[10px] font-medium ${
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : isAvail
                      ? 'text-zinc-300 hover:bg-zinc-800'
                      : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={onRefresh}
            title="Refresh quotas"
            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Selected Provider Details */}
      {currentQuota ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-zinc-800/50 p-2.5 rounded-lg border border-zinc-800">
            <div className="flex items-center space-x-2.5">
              <QuotaProgressRing
                percentage={currentQuota.primaryRemainingPercent}
                size={28}
                strokeWidth={3.5}
              />
              <div>
                <div className="font-semibold text-sm text-zinc-100 flex items-center gap-1.5">
                  {currentQuota.displayName}
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-300">
                    {currentQuota.isAuth ? 'Authenticated' : 'No Auth'}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400">
                  {formatTimeRemaining(currentQuota.timeUntilResetMs)}
                </div>
              </div>
            </div>

            <div className="text-right">
              {currentQuota.error && (!currentQuota.windows || currentQuota.windows.length === 0) ? (
                <>
                  <span className="text-base font-bold text-zinc-500">--</span>
                  <div className="text-[9px] text-zinc-400">No data</div>
                </>
              ) : (
                <>
                  <span className="text-base font-bold text-emerald-400">
                    {currentQuota.primaryRemainingPercent}%
                  </span>
                  <div className="text-[9px] text-zinc-400">Remaining</div>
                </>
              )}
            </div>
          </div>

          {/* Provider metadata (plan, membership, credits) */}
          {currentQuota.metadata && Object.keys(currentQuota.metadata).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {currentQuota.metadata.membership && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                  Plan: {currentQuota.metadata.membership}
                </span>
              )}
              {currentQuota.metadata.planType && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                  Plan: {currentQuota.metadata.planType}
                </span>
              )}
              {currentQuota.metadata.creditsBalance != null && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300 border border-zinc-700">
                  Credits: {currentQuota.metadata.creditsBalance}
                </span>
              )}
              {currentQuota.metadata.extraUsage && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300 border border-zinc-700">
                  Extra Usage: {(currentQuota.metadata.extraUsage.balanceCents / 100).toFixed(2)}{' '}
                  {currentQuota.metadata.extraUsage.currency}
                </span>
              )}
              {currentQuota.metadata.email && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300 border border-zinc-700">
                  {currentQuota.metadata.email}
                </span>
              )}
              {Array.isArray(currentQuota.metadata.authenticatedProviders) &&
                currentQuota.metadata.authenticatedProviders.length > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300 border border-zinc-700">
                    Auth:{' '}
                    {currentQuota.metadata.authenticatedProviders
                      .map((p) => `${p.id} (${p.type})`)
                      .join(', ')}
                  </span>
                )}
              {Array.isArray(currentQuota.metadata.configuredProviders) &&
                currentQuota.metadata.configuredProviders.length > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300 border border-zinc-700">
                    Config: {currentQuota.metadata.configuredProviders.join(', ')}
                  </span>
                )}
            </div>
          )}

          {/* Usage Windows Breakdown */}
          {currentQuota.windows && currentQuota.windows.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Usage Windows
              </div>
              {currentQuota.windows.map((win, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-950/40 p-2 rounded-md border border-zinc-800/80 space-y-1"
                >
                  <div className="flex justify-between text-[11px]">
                    <span className="font-medium text-zinc-200">{win.name}</span>
                    <span className="text-zinc-400">{win.usagePercent}% used</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        win.usagePercent > 80
                          ? 'bg-red-500'
                          : win.usagePercent > 55
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, win.usagePercent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {currentQuota.error && (
            <div className="flex items-start gap-1.5 text-[10px] text-amber-400/90 bg-amber-950/30 p-2 rounded border border-amber-800/40">
              <TriangleAlert size={12} className="mt-px shrink-0" />
              <span>{currentQuota.error}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="py-6 text-center text-zinc-500 text-xs">Loading provider quota data...</div>
      )}
    </div>
  );
}
