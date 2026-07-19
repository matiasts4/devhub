import { PROVIDER_LABELS } from '../../lib/quota/types.js';
import { QuotaProgressRing } from './QuotaProgressRing.jsx';

export function QuotaInspectorPopover({
  allQuotas = {},
  selectedProvider = 'grok',
  onSelectProvider,
  onRefresh,
  onClose,
}) {
  const currentQuota = allQuotas[selectedProvider] || null;

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
    <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-zinc-800 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md z-50 text-zinc-100 font-sans text-xs">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar max-w-[200px]">
          {Object.entries(PROVIDER_LABELS).map(([id, label]) => {
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
            🔄
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
          >
            ✕
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
              <span className="text-base font-bold text-emerald-400">
                {currentQuota.primaryRemainingPercent}%
              </span>
              <div className="text-[9px] text-zinc-400">Remaining</div>
            </div>
          </div>

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
            <div className="text-[10px] text-amber-400/90 bg-amber-950/30 p-2 rounded border border-amber-800/40">
              ⚠️ {currentQuota.error}
            </div>
          )}
        </div>
      ) : (
        <div className="py-6 text-center text-zinc-500 text-xs">Loading provider quota data...</div>
      )}
    </div>
  );
}
