import { useEffect, useCallback, useState } from 'react';
import { X, Minus, Square, Sparkles, Plus } from 'lucide-react';

/**
 * TitleBar — VS Code / Antigravity style compact titlebar
 *
 * Layout (single row, ~32px):
 *   [Icon] File Edit View ... |  Title / Project Name  |  [−] [□] [×]
 *
 * Props:
 *  - title: string shown in center (default: 'DevHub')
 *  - subtitle: optional smaller text next to title
 *  - className: extra classes for the outer wrapper
 *  - showMenu: boolean — show File/Edit/View menu items (default: true)
 */
export default function TitleBar({
  title = 'DevHub',
  subtitle,
  className = '',
  showMenu = true,
  leftSlot,
  rightSlot,
  showWindowControls = true,
}) {
  const [isMaximized, setIsMaximized] = useState(false);
  // Lazy-import Tauri API only in Tauri context
  const getTauriWindow = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      return getCurrentWindow();
    } catch {
      return null;
    }
  }, []);

  // Detect platform and track maximize state
  useEffect(() => {
    let unlisten;
    (async () => {
      const win = await getTauriWindow();
      if (!win) return;
      const current = await win.isMaximized().catch(() => false);
      setIsMaximized(current);
      unlisten = await win
        .onResized(async () => {
          const max = await win.isMaximized().catch(() => false);
          setIsMaximized(max);
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

  const handleMinimize = useCallback(async () => {
    const win = await getTauriWindow();
    await win?.minimize().catch(() => {});
  }, [getTauriWindow]);

  const handleToggleMaximize = useCallback(async () => {
    const win = await getTauriWindow();
    if (!win) return;
    // Use explicit maximize/unmaximize instead of toggleMaximize — Tauri v2's
    // toggleMaximize races with the onResized listener and can return
    // a no-op when local state and native state disagree. The explicit
    // pair is deterministic. We do NOT call setIsMaximized here — the
    // onResized listener (above) will read win.isMaximized() and update
    // state once the window actually resizes, avoiding any local-vs-native
    // race. Tauri v2 API only exposes maximize() / unmaximize() / toggleMaximize();
    // there is no setMaximized(boolean).
    const current = await win.isMaximized().catch(() => false);
    if (current) {
      await win.unmaximize().catch(() => {});
    } else {
      await win.maximize().catch(() => {});
    }
  }, [getTauriWindow]);

  const handleClose = useCallback(async () => {
    const win = await getTauriWindow();
    await win?.close().catch(() => {});
  }, [getTauriWindow]);

  const menuItems = ['File', 'Edit', 'View', 'Terminal', 'Help'];

  return (
    <div
      className={`relative flex items-center w-full select-none shrink-0 pr-[80px] border-b backdrop-blur-xl ${className}`}
      style={{
        height: 46,
        minHeight: 46,
        borderBottomColor: 'color-mix(in srgb, var(--border-subtle) 92%, transparent)',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.028) 100%), linear-gradient(180deg, color-mix(in srgb, var(--surface-app) 90%, black), color-mix(in srgb, var(--surface-card) 82%, black))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
      data-tauri-drag-region
      onDoubleClick={handleToggleMaximize}
    >
      {/* ── Left: App Icon + Menu ── */}
      <div
        className="flex items-center h-full shrink-0 pl-2"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {leftSlot ?? (
          <>
            {/* App icon */}
            <div className="flex items-center gap-1.5 mr-3">
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
            </div>

            {/* Menu items */}
            {showMenu && (
              <div className="flex items-center gap-0.5">
                {menuItems.map((item) => (
                  <button
                    key={item}
                    className="px-2.5 py-1.5 text-[11px] font-sans text-gray-400 hover:text-white hover:bg-white/[0.06] rounded-full transition-colors duration-150"
                    style={{ WebkitAppRegion: 'no-drag' }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Center: Title (Draggable Region) ── */}
      <div
        data-tauri-drag-region
        className="flex-1 min-w-0 flex items-center justify-center h-full overflow-hidden"
        style={{
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
        }}
        onDoubleClick={handleToggleMaximize}
      >
        <div className="flex items-center gap-2 px-2">
          <span className="text-[11.5px] font-semibold text-gray-200/90 truncate">{title}</span>
          {subtitle && <span className="text-[10px] text-gray-500 truncate">— {subtitle}</span>}
        </div>
      </div>

      <div className="flex items-center h-full shrink-0 min-w-0 ml-auto" style={{ WebkitAppRegion: 'no-drag' }}>
        {rightSlot && (
          <div className="flex items-center h-full min-w-0 max-w-[52vw] sm:max-w-[460px] overflow-hidden pr-2">
            {rightSlot}
          </div>
        )}
      </div>

      {showWindowControls && (
        <div
          className="absolute right-4 top-0 z-40 flex items-center h-full shrink-0 gap-2"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <button
            onClick={handleMinimize}
            className="group flex items-center justify-center w-4 h-4 rounded-full bg-[#2f323e] hover:brightness-125 transition-[filter] duration-150"
            title="Minimize"
          >
            <Minus className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={3} />
          </button>
          <button
            onClick={handleToggleMaximize}
            className="group flex items-center justify-center w-4 h-4 rounded-full bg-[#464a57] hover:brightness-125 transition-[filter] duration-150"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Plus className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={3} />
          </button>
          <button
            onClick={handleClose}
            className="group flex items-center justify-center w-4 h-4 rounded-full bg-[#B80096] hover:brightness-110 transition-[filter] duration-150"
            title="Close"
          >
            <X className="w-2.5 h-2.5 text-black stroke-[3px]" />
          </button>
        </div>
      )}
    </div>
  );
}
