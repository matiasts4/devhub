import { useCallback, useState, useEffect } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import NotificationCenter from './NotificationCenter';

/**
 * PageHeader - Integrated header for all pages (except terminals)
 * Combines titlebar functionality with page-specific content
 */
export default function PageHeader({
  project,
  pageName,
  children, // Page-specific controls/buttons
  className = '',
}) {
  // --- Window Controls ---
  const getTauriWindow = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      return getCurrentWindow();
    } catch {
      return null;
    }
  }, []);

  const [isWinMaximized, setIsWinMaximized] = useState(false);

  useEffect(() => {
    let unlisten;
    (async () => {
      const win = await getTauriWindow();
      if (!win) return;
      const current = await win.isMaximized().catch(() => false);
      setIsWinMaximized(current);
      unlisten = await win
        .onResized(async () => {
          const max = await win.isMaximized().catch(() => false);
          setIsWinMaximized(max);
        })
        .catch(() => null);
    })();
    return () => {
      try {
        unlisten?.();
      } catch {
        /* ignore */
      }
    };
  }, [getTauriWindow]);

  const handleWinMinimize = useCallback(async () => {
    const win = await getTauriWindow();
    await win?.minimize().catch(() => {});
  }, [getTauriWindow]);

  const handleWinToggleMaximize = useCallback(async () => {
    const win = await getTauriWindow();
    await win?.toggleMaximize().catch(() => {});
  }, [getTauriWindow]);

  const handleWinClose = useCallback(async () => {
    const win = await getTauriWindow();
    await win?.close().catch(() => {});
  }, [getTauriWindow]);

  return (
    <div
      className={`flex items-center h-[40px] bg-[#0a0a0a] border-b border-[rgba(255,255,255,0.04)] px-3 shrink-0 ${className}`}
      data-tauri-drag-region
      onDoubleClick={handleWinToggleMaximize}
    >
      {/* Left: App Icon + Project Name */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
        <div className="w-6 h-6 rounded-full overflow-hidden bg-[#58A6FF]/10 border border-[#58A6FF]/20 flex items-center justify-center shadow-sm">
          <img src="/logo.png" alt="DevHub logo" className="w-full h-full object-cover" />
        </div>
        <span className="font-semibold text-text-primary text-[12px] tracking-wide opacity-90">
          DevHub <span className="opacity-40 font-normal mx-2">/</span> {project?.name || ''}
        </span>
      </div>

      {/* Center: Page-specific content */}
      <div
        className="flex-1 flex items-center justify-end gap-3 px-4"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {children}
      </div>

      {/* Right: Notifications + Page Indicator + Window Controls */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
        <NotificationCenter projectId={project?.id} variant="topbar" />
        <div
          className="text-[11px] px-3 py-1 rounded-full border shadow-sm flex items-center gap-2"
          style={{
            borderColor: 'var(--border-subtle)',
            background: 'rgba(255,255,255,0.03)',
            color: 'var(--text-muted)',
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-green-500/80 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          {pageName}
        </div>

        {/* Window Controls - Circular macOS style */}
        <div className="flex items-center gap-2.5 ml-2 pl-2 border-l border-[rgba(255,255,255,0.04)]">
          <button
            onClick={handleWinMinimize}
            className="group flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#2f323e] hover:bg-[#434857] transition-colors"
            title="Minimize"
          >
            <Minus
              className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity"
              strokeWidth={3}
            />
          </button>
          <button
            onClick={handleWinToggleMaximize}
            className="group flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#464a57] hover:bg-[#5b6070] transition-colors"
            title={isWinMaximized ? 'Restore' : 'Maximize'}
          >
            <Plus
              className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity"
              strokeWidth={3}
            />
          </button>
          <button
            onClick={handleWinClose}
            className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#B80096] hover:bg-[#D600AE] transition-colors"
            title="Close"
          >
            <X className="w-2.5 h-2.5 text-black stroke-[3px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
