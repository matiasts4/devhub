'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Terminal, Palette, Mic, Keyboard, Bot, X } from 'lucide-react';

import {
  panelStyle,
  panelHeaderStripStyle,
  btnSecondaryStyle,
  pillStyle,
} from '@/chrome/morphology';
import { chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import {
  RESTORE_POLICY,
  readTerminalRestorePreferences,
  writeTerminalRestorePreferences,
} from '@/lib/terminal/restorePreferences';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import TerminalSettingsSection from '@/components/settings/TerminalSettingsSection';
import PizarraSettings from '@/components/settings/PizarraSettings';
import ZedVoiceSettings from '@/components/settings/ZedVoiceSettings';
import TerminalShortcutsSettings from '@/components/settings/TerminalShortcutsSettings';
import TerminalAgentsSettings from '@/components/settings/TerminalAgentsSettings';

const SECTIONS = [
  { key: 'restore', label: 'Restauración', icon: RotateCcw },
  { key: 'terminal', label: 'Terminal', icon: Terminal },
  { key: 'pizarra', label: 'Pizarra', icon: Palette },
  { key: 'voice', label: 'Voz', icon: Mic },
  { key: 'shortcuts', label: 'Atajos', icon: Keyboard },
  { key: 'agents', label: 'Agentes', icon: Bot },
];

function RestoreSection() {
  const [restorePrefs, setRestorePrefs] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        opencode: RESTORE_POLICY.AUTO,
        generic: RESTORE_POLICY.AUTO,
        swarm: RESTORE_POLICY.AUTO,
      };
    }
    return readTerminalRestorePreferences(window.localStorage);
  });
  const [saveHint, setSaveHint] = useState('Los cambios en cada selector se guardan al instante.');

  const persistPreferences = (nextPrefs, { announce = true } = {}) => {
    if (typeof window === 'undefined') return;
    writeTerminalRestorePreferences(window.localStorage, nextPrefs);
    if (announce) {
      setSaveHint(
        `Guardado: OpenCode ${nextPrefs.opencode}, Shell ${nextPrefs.generic}, Swarm ${nextPrefs.swarm}.`
      );
    }
  };

  const handlePolicyChange = (sessionType) => (nextPolicy) => {
    setRestorePrefs((prev) => {
      const next = { ...prev, [sessionType]: nextPolicy };
      persistPreferences({ [sessionType]: nextPolicy });
      return next;
    });
  };

  const SESSION_TYPES = [
    { key: 'opencode', label: 'OpenCode', icon: '◆' },
    { key: 'generic', label: 'Shell Genérico', icon: '$' },
    { key: 'swarm', label: 'Swarm', icon: '◇' },
  ];

  const POLICY_OPTIONS = [
    { value: RESTORE_POLICY.AUTO, label: 'Automático' },
    { value: RESTORE_POLICY.MANUAL, label: 'Manual' },
    { value: RESTORE_POLICY.OFF, label: 'Desactivado' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h4 className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Políticas de restauración
        </h4>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Los paneles y layouts siempre se restauran desde el estado guardado. Estas políticas
          controlan el relanzamiento automático del proceso/TUI al iniciar (OpenCode con sesión,
          Grok/Kimi relanzan el binario; Swarm reattach tmux).
        </p>
      </div>

      {saveHint ? (
        <p
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
          data-testid="restore-prefs-save-hint"
        >
          {saveHint}
        </p>
      ) : null}

      <div className="space-y-4">
        {SESSION_TYPES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <label
              htmlFor={`restore-policy-${key}`}
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {label}
            </label>
            <Select value={restorePrefs[key]} onValueChange={handlePolicyChange(key)}>
              <SelectTrigger
                id={`restore-policy-${key}`}
                data-testid={`restore-policy-modal-${key}`}
                className="h-9 w-[160px] rounded-xl border px-3 text-sm"
                style={{
                  background: 'var(--chrome-control-fill)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <SelectValue placeholder="Seleccionar política" />
              </SelectTrigger>
              <SelectContent
                className="z-[10001] rounded-xl border !bg-[var(--surface-elevated)]"
                style={{
                  backgroundColor: 'var(--surface-elevated) !important',
                }}
              >
                {POLICY_OPTIONS.map(({ value, label: optionLabel }) => (
                  <SelectItem
                    key={value}
                    value={value}
                    className="text-sm"
                    style={{
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--surface-elevated)',
                    }}
                  >
                    {optionLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div
        className="mt-5 space-y-2 rounded-lg border p-4 text-xs"
        style={panelStyle({ emphasized: false })}
      >
        <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Políticas de restauración:
        </p>
        <div className="space-y-1.5" style={{ color: 'var(--text-muted)' }}>
          <div className="flex items-start gap-2">
            <span
              className="mt-0.5 inline-flex items-center"
              style={pillStyle({ tone: 'success' })}
            >
              Auto
            </span>
            <span>Restaura la terminal automáticamente al iniciar.</span>
          </div>
          <div className="flex items-start gap-2">
            <span
              className="mt-0.5 inline-flex items-center"
              style={pillStyle({ tone: 'warning' })}
            >
              Manual
            </span>
            <span>Panel suspendido hasta que hagas clic en continuar.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex items-center" style={pillStyle({ tone: 'danger' })}>
              Off
            </span>
            <span>Ignora esta terminal al inicio.</span>
          </div>
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Afecta el próximo arranque de DevHub.
      </p>
    </div>
  );
}

function SectionContent({ section }) {
  switch (section) {
    case 'restore':
      return <RestoreSection />;
    case 'terminal':
      return <TerminalSettingsSection includeRestorePolicies={false} />;
    case 'pizarra':
      return <PizarraSettings />;
    case 'voice':
      return <ZedVoiceSettings />;
    case 'shortcuts':
      return <TerminalShortcutsSettings />;
    case 'agents':
      return <TerminalAgentsSettings />;
    default:
      return null;
  }
}

/**
 * TerminalRestoreSettingsModal — opened from the top-bar gear button in the terminal workspace.
 * Settings hub for the terminal workspace: restore policies, terminal appearance, pizarra,
 * voice, shortcuts, and agents.
 * Uses z-[10000] and createPortal to appear above native terminal surfaces.
 *
 * @param {boolean} open - controls modal visibility
 * @param {function} onClose - called when the user dismisses the modal
 */
export default function TerminalRestoreSettingsModal({ open, onClose }) {
  const [activeSection, setActiveSection] = useState('restore');

  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setActiveSection('restore');
  }, [open]);

  if (!open) return null;

  const activeLabel = SECTIONS.find((s) => s.key === activeSection)?.label || 'Configuración';

  const modalContent = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Configuración del workspace de terminales"
      style={{ background: 'var(--chrome-overlay, rgba(0,0,0,0.6))' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="flex h-[640px] w-full max-w-4xl overflow-hidden"
        style={panelStyle({ emphasized: true })}
      >
        {/* Sidebar */}
        <div
          className="flex w-[200px] shrink-0 flex-col border-r"
          style={{
            borderColor: 'var(--chrome-border-color)',
            background: 'var(--chrome-panel-fill)',
          }}
        >
          <div className="px-4 py-5 border-b" style={{ borderColor: 'var(--chrome-border-color)' }}>
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: 'var(--text-muted)' }}
            >
              <RotateCcw className="w-3 h-3" />
              Configuración
            </span>
          </div>

          <nav className="flex-1 overflow-y-auto p-2 space-y-1">
            {SECTIONS.map(({ key, label, icon: Icon }) => {
              const isActive = activeSection === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveSection(key)}
                  data-testid={`terminal-settings-section-${key}`}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-xs font-medium transition-all"
                  style={
                    isActive
                      ? {
                          ...chromeSurfaceStyle({ surface: 'pill', emphasized: true }),
                          color: 'var(--text-primary)',
                        }
                      : {
                          color: 'var(--text-secondary)',
                          background: 'transparent',
                        }
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </nav>

          <div
            className="px-4 py-3 text-[10px] border-t"
            style={{ color: 'var(--text-muted)', borderColor: 'var(--chrome-border-color)' }}
          >
            DevHub Terminal Workspace
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Header */}
          <div
            className="flex items-center justify-between gap-4 border-b px-6 py-4"
            style={panelHeaderStripStyle()}
          >
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center gap-1"
                style={pillStyle({ tone: 'accent' })}
              >
                ⚙ {activeLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
              style={btnSecondaryStyle({ size: 'sm' })}
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <SectionContent section={activeSection} />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
