/* eslint-disable no-unused-vars */
import { useCallback, useState, useEffect } from 'react';
import { X, Minus, Plus, Terminal as TerminalIcon } from 'lucide-react';
import NotificationCenter from './NotificationCenter';
import UserProfile from './UserProfile';
import { isElectronDesktop } from '@/lib/desktop/desktopBridge';
import * as windowControls from '@/lib/desktop/windowControls';

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
  // --- Window Controls (Electron IPC or Tauri) ---
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
    let unsubElectron;
    let cancelled = false;

    (async () => {
      if (isElectronDesktop()) {
        const max = await windowControls.isMaximized();
        if (!cancelled) setIsWinMaximized(Boolean(max));
        try {
          unsubElectron = window.devhubDesktop?.on?.('window-event', (payload) => {
            if (payload?.type === 'maximize') setIsWinMaximized(true);
            if (payload?.type === 'unmaximize') setIsWinMaximized(false);
          });
        } catch {
          /* ignore */
        }
        return;
      }

      const win = await getTauriWindow();
      if (!win || cancelled) return;
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
      cancelled = true;
      try {
        unlisten?.();
      } catch {
        /* ignore */
      }
      try {
        unsubElectron?.();
      } catch {
        /* ignore */
      }
    };
  }, [getTauriWindow]);

  const handleWinMinimize = useCallback(async () => {
    if (isElectronDesktop()) {
      await windowControls.minimize();
      return;
    }
    const win = await getTauriWindow();
    await win?.minimize().catch(() => {});
  }, [getTauriWindow]);

  const handleWinToggleMaximize = useCallback(async () => {
    if (isElectronDesktop()) {
      await windowControls.toggleMaximize();
      const max = await windowControls.isMaximized();
      setIsWinMaximized(Boolean(max));
      return;
    }
    const win = await getTauriWindow();
    if (!win) return;
    // Explicit maximize/unmaximize avoids Tauri v2 toggleMaximize races.
    const current = await win.isMaximized().catch(() => false);
    if (current) {
      await win.unmaximize().catch(() => {});
    } else {
      await win.maximize().catch(() => {});
    }
  }, [getTauriWindow]);

  const handleWinClose = useCallback(async () => {
    if (isElectronDesktop()) {
      await windowControls.close();
      return;
    }
    const win = await getTauriWindow();
    await win?.close().catch(() => {});
  }, [getTauriWindow]);

  return (
    <div
      className={`flex items-center h-[46px] border-b px-3 shrink-0 backdrop-blur-xl ${className}`}
      data-tauri-drag-region
      onDoubleClick={handleWinToggleMaximize}
      style={{
        zIndex: 50,
        borderBottomColor: 'color-mix(in srgb, var(--border-subtle) 92%, transparent)',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.028) 100%), linear-gradient(180deg, color-mix(in srgb, var(--surface-app) 90%, black), color-mix(in srgb, var(--surface-card) 82%, black))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        WebkitAppRegion: 'drag',
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
        <UserProfile />

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
