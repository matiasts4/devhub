import { useCallback, useState, useEffect } from 'react';
import { X, Minus, Plus, Terminal as TerminalIcon } from 'lucide-react';
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
      className={`flex items-center h-[46px] border-b px-3 shrink-0 backdrop-blur-xl ${className}`}
      data-tauri-drag-region
      onDoubleClick={handleWinToggleMaximize}
      style={{
        borderBottomColor: 'color-mix(in srgb, var(--border-subtle) 92%, transparent)',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.028) 100%), linear-gradient(180deg, color-mix(in srgb, var(--surface-app) 90%, black), color-mix(in srgb, var(--surface-card) 82%, black))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* Left: App Icon + Project Name */}
      <div className="flex items-center gap-3 min-w-0" style={{ WebkitAppRegion: 'no-drag' }}>
        <div
          className="h-9 w-9 border-2 flex items-center justify-center"
          style={{
            borderColor: 'var(--accent-primary)',
            backgroundColor: 'var(--accent-primary)',
            boxShadow: '2px 2px 0 0 var(--accent-shadow)',
            borderRadius: 0,
          }}
        >
          <TerminalIcon className="w-5 h-5" style={{ color: '#000', strokeWidth: 2.5 }} />
        </div>
        <span className="font-semibold text-text-primary text-[12px] tracking-[0.02em] opacity-90 truncate">
          DEVHUB <span className="opacity-40 font-normal mx-2">/</span> {project?.name || ''}
        </span>
      </div>

      {/* Center: Page-specific content */}
      <div
        className="flex-1 flex items-center justify-end gap-3 px-4"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {children}
      </div>

      {/* Right: Notifications + Window Controls */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
        <NotificationCenter projectId={project?.id} variant="topbar" />

        {/* Window Controls - Circular macOS style */}
        <div className="flex items-center gap-2.5 ml-2 pl-2 border-l border-[rgba(255,255,255,0.07)]">
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
