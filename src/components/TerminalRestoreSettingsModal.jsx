'use client';

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
import ZedOverlaySettings from '@/components/settings/ZedOverlaySettings';
import ZedModelSettings from '@/components/settings/ZedModelSettings';
import TerminalShortcutsSettings from '@/components/settings/TerminalShortcutsSettings';
import TerminalAgentsSettings from '@/components/settings/TerminalAgentsSettings';
import { QuotaProviderSettings } from '@/components/quota/QuotaProviderSettings';
import NotificationSettingsSection from '@/components/settings/NotificationSettingsSection';
import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  RotateCcw,
  Terminal,
  Palette,
  Mic,
  Keyboard,
  Bot,
  Sparkles,
  X,
  Gauge,
  Settings,
  Bell,
} from 'lucide-react';

import {
  panelStyle,
  panelHeaderStripStyle,
  btnSecondaryStyle,
  pillStyle,
} from '@/chrome/morphology';
import { chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import {
  RESTORE_POLICY,
  TERMINAL_RESTORE_KINDS,
  readTerminalRestorePreferences,
  writeTerminalRestorePreferences,
} from '@/lib/terminal/restorePreferences';

const SECTIONS = [
  { key: 'restore', label: 'Restauración', icon: RotateCcw },
  { key: 'terminal', label: 'Terminal', icon: Terminal },
  { key: 'pizarra', label: 'Pizarra', icon: Palette },
  { key: 'zed', label: 'Zed', icon: Sparkles },
  { key: 'voice', label: 'Voz', icon: Mic },
  { key: 'shortcuts', label: 'Atajos', icon: Keyboard },
  { key: 'agents', label: 'Agentes', icon: Bot },
  { key: 'notifications', label: 'Notificaciones', icon: Bell },
  { key: 'cuotas', label: 'Cuotas', icon: Gauge },
];

const RESTORE_KIND_LABELS = {
  opencode: 'OpenCode',
  kimi: 'Kimi Code',
  grok: 'Grok',
  codex: 'Codex',
  qoder: 'Qoder',
  swarm: 'Swarm',
  generic: 'Shell genérico',
};

function RestoreSection() {
  const [restorePrefs, setRestorePrefs] = useState(() =>
    readTerminalRestorePreferences(typeof window === 'undefined' ? null : window.localStorage)
  );
  const [saveHint, setSaveHint] = useState('Los cambios en cada selector se guardan al instante.');

  // Legacy prefs may lack the newer kinds or the master switch — fall back to
  // the same defaults readTerminalRestorePreferences applies (auto / true).
  const rebootRestoreEnabled = restorePrefs?.restoreOnReboot !== false;
  const policyFor = (kind) => restorePrefs?.[kind] || RESTORE_POLICY.AUTO;

  const persistPreferences = (partial, { announce } = {}) => {
    if (typeof window === 'undefined') return;
    writeTerminalRestorePreferences(window.localStorage, partial);
    if (announce) {
      setSaveHint(announce);
    }
  };

  const handlePolicyChange = (kind) => (nextPolicy) => {
    setRestorePrefs((prev) => ({ ...prev, [kind]: nextPolicy }));
    const optionLabel =
      POLICY_OPTIONS.find(({ value }) => value === nextPolicy)?.label || nextPolicy;
    persistPreferences(
      { [kind]: nextPolicy },
      { announce: `Guardado: ${RESTORE_KIND_LABELS[kind] || kind} → ${optionLabel}.` }
    );
  };

  const handleMasterToggle = () => {
    const next = !rebootRestoreEnabled;
    setRestorePrefs((prev) => ({ ...prev, restoreOnReboot: next }));
    persistPreferences(
      { restoreOnReboot: next },
      {
        announce: next
          ? 'Guardado: restauración al reiniciar activada.'
          : 'Guardado: restauración al reiniciar desactivada.',
      }
    );
  };

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

      <div
        className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
        style={panelStyle({ emphasized: false })}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Restaurar sesiones al reiniciar el equipo
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Interruptor maestro de la restauración automática al iniciar DevHub. Al desactivarlo,
            ninguna sesión se relanza sola; siempre podés reanudarlas a mano.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={rebootRestoreEnabled}
          data-testid="restore-on-reboot-toggle"
          onClick={handleMasterToggle}
          className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
          style={{
            background: rebootRestoreEnabled ? 'var(--accent-primary)' : 'var(--surface-muted)',
          }}
        >
          <span
            className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
            style={{ transform: rebootRestoreEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
          />
        </button>
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

      {!rebootRestoreEnabled ? (
        <p
          className="text-xs"
          style={{ color: 'var(--text-muted)' }}
          data-testid="restore-on-reboot-off-hint"
        >
          La restauración automática está desactivada. La reanudación manual sigue disponible desde
          el panel suspendido.
        </p>
      ) : null}

      <div
        className="space-y-4 transition-opacity"
        style={{ opacity: rebootRestoreEnabled ? 1 : 0.5 }}
        data-testid="restore-policy-list"
        data-disabled={rebootRestoreEnabled ? 'false' : 'true'}
      >
        {TERMINAL_RESTORE_KINDS.map((key) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <label
              htmlFor={`restore-policy-${key}`}
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {RESTORE_KIND_LABELS[key] || key}
            </label>
            <Select
              value={policyFor(key)}
              onValueChange={handlePolicyChange(key)}
              disabled={!rebootRestoreEnabled}
            >
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
          Qué hace cada política (por proveedor):
        </p>
        <div className="space-y-1.5" style={{ color: 'var(--text-muted)' }}>
          <div className="flex items-start gap-2">
            <span
              className="mt-0.5 inline-flex items-center"
              style={pillStyle({ tone: 'success' })}
            >
              Auto
            </span>
            <span>Restaura la sesión de ese proveedor al reiniciar.</span>
          </div>
          <div className="flex items-start gap-2">
            <span
              className="mt-0.5 inline-flex items-center"
              style={pillStyle({ tone: 'warning' })}
            >
              Manual
            </span>
            <span>La sesión queda suspendida y la reanudás vos.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex items-center" style={pillStyle({ tone: 'danger' })}>
              Off
            </span>
            <span>No se restaura la sesión de ese proveedor.</span>
          </div>
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Afecta el próximo arranque de DevHub.
      </p>
    </div>
  );
}

function SectionContent({ section, onNavigateToZed }) {
  switch (section) {
    case 'restore':
      return <RestoreSection />;
    case 'terminal':
      return <TerminalSettingsSection includeRestorePolicies={false} />;
    case 'pizarra':
      return <PizarraSettings />;
    case 'zed':
      return (
        <div className="space-y-6">
          <ZedModelSettings />
          <ZedOverlaySettings />
        </div>
      );
    case 'voice':
      return <ZedVoiceSettings onNavigateToZed={onNavigateToZed} />;
    case 'shortcuts':
      return <TerminalShortcutsSettings />;
    case 'agents':
      return <TerminalAgentsSettings />;
    case 'notifications':
      return <NotificationSettingsSection />;
    case 'cuotas':
      return (
        <div className="space-y-5">
          <div>
            <h4
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Cuotas de IA en el header
            </h4>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Elige qué proveedores sincroniza el badge de cuotas del workspace, en qué orden se
              muestran y cuál queda fijado por defecto (★). Los desactivados no se consultan nunca —
              ni en el header ni en segundo plano. Los cambios se guardan al instante.
            </p>
          </div>
          <QuotaProviderSettings />
        </div>
      );
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
 * PERF: exported via React.memo — the parent (WorkspaceRenderAssembly) reconciles
 * on every workspace state change; without memo the whole settings subtree would
 * re-render and block the main thread while the user scrolls inside the modal.
 *
 * @param {boolean} open - controls modal visibility
 * @param {function} onClose - called when the user dismisses the modal
 * @param {string} [initialSection] - section key to show when the modal opens (defaults to 'restore')
 */
function TerminalRestoreSettingsModal({ open, onClose, initialSection }) {
  const [activeSection, setActiveSection] = useState('restore');
  // Sections that were visited during this open stay mounted (hidden) so
  // switching back is instant and async data is not refetched.
  const [visitedSections, setVisitedSections] = useState(() => new Set(['restore']));
  const bodyRef = useRef(null);
  const prefetchedRef = useRef(new Set());

  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      const initial = initialSection || 'restore';
      setActiveSection(initial);
      setVisitedSections(new Set([initial]));
    }
  }, [open, initialSection]);

  const selectSection = (key) => {
    setActiveSection(key);
    setVisitedSections((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };

  // Warm up async endpoints before the user commits to a section so the
  // perceived load time on click is minimal (also pre-compiles dev routes).
  const prefetchSection = (key) => {
    if (prefetchedRef.current.has(key)) return;
    prefetchedRef.current.add(key);
    if (key === 'zed') {
      fetch('/api/settings/llm-providers').catch(() => {});
      fetch('/api/assistant/zed-provider-status').catch(() => {});
    }
  };

  if (!open) return null;

  const activeLabel = SECTIONS.find((s) => s.key === activeSection)?.label || 'Configuración';

  const modalContent = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      data-devhub-modal="true"
      data-state="open"
      aria-label="Configuración del workspace de terminales"
      style={{
        background: 'var(--chrome-overlay, rgba(0,0,0,0.6))',
        // Own compositor layer: scrolling inside the modal never repaints the
        // page behind it (live WebGL terminal canvases), and vice versa.
        willChange: 'transform',
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="flex h-[640px] w-full max-w-4xl overflow-hidden"
        style={{ ...panelStyle({ emphasized: true }), contain: 'layout paint' }}
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
                  onClick={() => selectSection(key)}
                  onMouseEnter={() => prefetchSection(key)}
                  data-testid={`terminal-settings-section-${key}`}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-xs font-medium transition-colors duration-100"
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
                <Settings className="w-3 h-3" />
                {activeLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="inline-flex items-center justify-center transition-colors hover:opacity-85"
              style={{
                ...btnSecondaryStyle({ size: 'sm' }),
                width: '2.25rem',
                height: '2.25rem',
                padding: 0,
              }}
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body — visited sections stay mounted (hidden) for instant switching */}
          <div
            ref={bodyRef}
            className="flex-1 overflow-y-auto px-6 py-5"
            style={{ overscrollBehavior: 'contain' }}
          >
            {SECTIONS.filter(({ key }) => visitedSections.has(key)).map(({ key }) => (
              <div key={key} className={activeSection === key ? undefined : 'hidden'}>
                <SectionContent section={key} onNavigateToZed={() => selectSection('zed')} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default memo(TerminalRestoreSettingsModal);
