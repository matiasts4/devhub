import { useEffect } from 'react';
import { X, Keyboard, Command, MessageSquare, Terminal } from 'lucide-react';

const shortcutGroups = [
  {
    title: 'Global',
    icon: Command,
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Abrir Command Palette' },
      { keys: ['Ctrl', 'N'], description: 'Nueva conversación' },
      { keys: ['Ctrl', '?'], description: 'Este menú de ayuda' },
    ],
  },
  {
    title: 'Chat',
    icon: MessageSquare,
    shortcuts: [
      { keys: ['Ctrl', 'Enter'], description: 'Enviar mensaje' },
      { keys: ['Shift', 'Enter'], description: 'Nueva línea' },
      { keys: ['Esc'], description: 'Cancelar edición / Cerrar modal' },
    ],
  },
  {
    title: 'Terminal',
    icon: Terminal,
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'R'], description: 'Dividir panel derecha' },
      { keys: ['Ctrl', 'Shift', 'D'], description: 'Dividir panel abajo' },
      { keys: ['Ctrl', 'Shift', 'W'], description: 'Cerrar panel' },
    ],
  },
];

export default function KeyboardShortcutsHelp({ isOpen, onClose }) {
  // Ctrl+? keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '?' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Atajos de teclado"
    >
      <div
        className="w-full max-w-lg mx-3 sm:mx-4 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[80vh]"
        style={{
          background: 'var(--surface-muted)',
          border: '1px solid var(--border-strong)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border-strong)' }}
        >
          <div className="flex items-center gap-3">
            <Keyboard className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Atajos de Teclado
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.background = 'var(--surface-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'transparent';
            }}
            aria-label="Cerrar atajos de teclado"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {shortcutGroups.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.title}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <h4
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {group.title}
                  </h4>
                </div>
                <div className="space-y-2">
                  {group.shortcuts.map((sc) => (
                    <div
                      key={sc.description}
                      className="flex items-center justify-between py-1.5 px-2 rounded-lg"
                      style={{ background: 'var(--surface-card)' }}
                    >
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {sc.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {sc.keys.map((key, i) => (
                          <span key={key}>
                            <kbd
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
                              style={{
                                background: 'var(--surface-elevated)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-strong)',
                              }}
                            >
                              {key}
                            </kbd>
                            {i < sc.keys.length - 1 && (
                              <span
                                className="mx-0.5 text-[10px]"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                +
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t text-center text-[10px]"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          Presiona <kbd style={{ fontFamily: 'monospace' }}>Ctrl + ?</kbd> para abrir/cerrar este
          menú
        </div>
      </div>
    </div>
  );
}
