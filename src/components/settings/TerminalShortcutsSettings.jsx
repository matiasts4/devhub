'use client';

import { Keyboard } from 'lucide-react';
import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import { TERMINAL_WORKSPACE_SHORTCUTS } from '@/components/terminal/workspaceShortcuts';

const GLOBAL_SHORTCUTS = [
  { action: 'Micrófono Zed (push-to-talk)', shortcut: 'Ctrl+Shift+M' },
  { action: 'Abrir / cerrar Zed', shortcut: 'Ctrl+Shift+Z' },
  { action: 'Zoom interfaz (+)', shortcut: 'Ctrl+Plus / Ctrl+=' },
  { action: 'Zoom interfaz (-)', shortcut: 'Ctrl+Minus' },
  { action: 'Reset zoom', shortcut: 'Ctrl+0' },
];

const LABELS = {
  splitDown: 'Dividir panel hacia abajo',
  splitRight: 'Dividir panel hacia la derecha',
  closePanel: 'Cerrar panel (doble atajo)',
  openBrowserDock: 'Abrir dock de navegador',
  openEditorDock: 'Abrir dock de editor',
  closeRightDock: 'Cerrar dock derecho',
  newWorkspace: 'Nuevo workspace',
  previousWorkspace: 'Workspace anterior',
  nextWorkspace: 'Workspace siguiente',
  panelLeft: 'Mover foco a panel izquierdo',
  panelRight: 'Mover foco a panel derecho',
  panelUp: 'Mover foco a panel superior',
  panelDown: 'Mover foco a panel inferior',
  togglePanelFocus: 'Alternar foco del panel',
  exitPanelFocus: 'Salir del foco del panel',
};

export default function TerminalShortcutsSettings() {
  return (
    <div className="space-y-6">
      <ChromeSurface asChild surface="panel" emphasized>
        <div
          className="overflow-hidden"
          style={chromeSurfaceStyle({ surface: 'panel', emphasized: true })}
        >
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={{
              borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)',
              background: 'var(--chrome-panel-fill-emphasis)',
            }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-none bg-[var(--accent-primary)]/15">
              <Keyboard className="h-4 w-4 text-[var(--accent-primary)]" />
            </div>
            <div>
              <h3
                className="font-mono text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Atajos del workspace de terminales
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Referencia rápida de teclas disponibles en la vista de terminales.
              </p>
            </div>
          </div>

          <div className="px-6 py-4 space-y-6">
            <div>
              <h4
                className="font-mono text-xs font-semibold uppercase tracking-[0.14em] mb-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                Globales
              </h4>
              <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {GLOBAL_SHORTCUTS.map(({ action, shortcut }) => (
                  <div
                    key={action}
                    className="flex items-center justify-between py-2.5 gap-4"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {action}
                    </span>
                    <kbd
                      className="shrink-0 px-2 py-1 rounded text-[10px] font-mono font-semibold"
                      style={chromeSurfaceStyle({ surface: 'pill', emphasized: true })}
                    >
                      {shortcut}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4
                className="font-mono text-xs font-semibold uppercase tracking-[0.14em] mb-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                Workspace
              </h4>
              <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {Object.entries(TERMINAL_WORKSPACE_SHORTCUTS).map(([key, shortcut]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-2.5 gap-4"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {LABELS[key] || key}
                    </span>
                    <kbd
                      className="shrink-0 px-2 py-1 rounded text-[10px] font-mono font-semibold"
                      style={chromeSurfaceStyle({ surface: 'pill', emphasized: true })}
                    >
                      {shortcut}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ChromeSurface>
    </div>
  );
}
