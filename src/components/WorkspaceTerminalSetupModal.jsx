'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, LayoutGrid, Minus, Plus, Sparkles, Terminal } from 'lucide-react';

import {
  panelStyle,
  panelHeaderStripStyle,
  btnSecondaryStyle,
  btnPrimaryStyle,
  pillStyle,
} from '@/chrome/morphology';
import {
  clampTerminalCount,
  getAdjacentCircularIndex,
  getAdjacentWorkspaceSetupSection,
  resolveCommandPresetArrowDelta,
  resolveSectionNavigationDelta,
  resolveTerminalCountDelta,
  resolveWorkspaceSetupSection,
  shouldAdjustTerminalCountFromKeyboard,
  shouldConfirmWorkspaceTerminalSetup,
  shouldNavigateCommandPresetsFromKeyboard,
  shouldNavigateWorkspaceSetupSections,
} from '@/components/terminal/workspaceTerminalSetupModalKeyboard';

const MIN_TERMINALS = 0;
const MAX_TERMINALS = 6;

const COMMAND_PRESETS = [
  {
    id: 'shell',
    label: 'Shell',
    command: '',
    description: 'Sin comando inicial',
    Icon: Terminal,
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    description: 'Inicia OpenCode en cada terminal',
    Icon: Bot,
  },
  {
    id: 'kimi',
    label: 'Kimi',
    command: 'kimi',
    description: 'Inicia Kimi en cada terminal',
    Icon: Sparkles,
  },
];

function normalizeInitialCommand(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function resolvePresetId(command) {
  const normalized = normalizeInitialCommand(command);
  if (!normalized) return 'shell';
  const preset = COMMAND_PRESETS.find((entry) => entry.command === normalized);
  return preset?.id || 'custom';
}

/**
 * WorkspaceTerminalSetupModal — shown when creating a new workspace.
 * Lets the user choose how many terminals to open and an optional initial command.
 */
export default function WorkspaceTerminalSetupModal({
  open,
  onClose,
  onConfirm,
  defaultInitialCommand = 'opencode',
}) {
  const [terminalCount, setTerminalCount] = useState(1);
  const [initialCommand, setInitialCommand] = useState(defaultInitialCommand);
  const [activePresetId, setActivePresetId] = useState('opencode');
  const [activeSection, setActiveSection] = useState('terminals');

  const modalPanelRef = useRef(null);
  const countFocusRef = useRef(null);
  const commandInputRef = useRef(null);
  const confirmButtonRef = useRef(null);
  const presetButtonRefs = useRef([]);

  const commandApplies = terminalCount > 0;
  const resolvedPresetId = useMemo(() => resolvePresetId(initialCommand), [initialCommand]);

  useEffect(() => {
    if (!open) return;
    const nextCommand = normalizeInitialCommand(defaultInitialCommand) || 'opencode';
    setTerminalCount(1);
    setInitialCommand(nextCommand);
    setActivePresetId(resolvePresetId(nextCommand));
    setActiveSection('terminals');
    presetButtonRefs.current = [];
  }, [open, defaultInitialCommand]);

  const focusWorkspaceSection = useCallback(
    (section) => {
      if (section === 'terminals') {
        countFocusRef.current?.focus();
        return;
      }

      if (section === 'commandPresets') {
        if (!commandApplies) {
          countFocusRef.current?.focus();
          return;
        }
        const currentIndex = Math.max(
          0,
          COMMAND_PRESETS.findIndex(
            (preset) => preset.id === activePresetId || preset.id === resolvedPresetId
          )
        );
        const presetButton =
          presetButtonRefs.current[currentIndex] ||
          modalPanelRef.current?.querySelector(
            `[data-testid="workspace-terminal-command-preset-${COMMAND_PRESETS[currentIndex]?.id}"]`
          );
        presetButton?.focus();
        return;
      }

      if (section === 'customCommand') {
        if (!commandApplies) {
          countFocusRef.current?.focus();
          return;
        }
        commandInputRef.current?.focus();
      }
    },
    [activePresetId, commandApplies, resolvedPresetId]
  );

  useLayoutEffect(() => {
    if (!open) return;
    focusWorkspaceSection('terminals');
  }, [focusWorkspaceSection, open]);

  useEffect(() => {
    if (!commandApplies && activeSection !== 'terminals') {
      setActiveSection('terminals');
      focusWorkspaceSection('terminals');
    }
  }, [activeSection, commandApplies, focusWorkspaceSection]);

  const decrement = useCallback(
    () => setTerminalCount((value) => clampTerminalCount(value - 1, MIN_TERMINALS, MAX_TERMINALS)),
    []
  );
  const increment = useCallback(
    () => setTerminalCount((value) => clampTerminalCount(value + 1, MIN_TERMINALS, MAX_TERMINALS)),
    []
  );

  const handlePresetSelect = useCallback((preset) => {
    setActivePresetId(preset.id);
    setInitialCommand(preset.command);
  }, []);

  const handleCommandInputChange = (event) => {
    const nextValue = event.target.value;
    setInitialCommand(nextValue);
    setActivePresetId(resolvePresetId(nextValue));
  };

  const handleConfirm = useCallback(() => {
    const trimmedCommand = normalizeInitialCommand(initialCommand);
    onConfirm?.({
      terminalCount,
      initialCommand: commandApplies && trimmedCommand ? trimmedCommand : null,
    });
    onClose?.();
  }, [commandApplies, initialCommand, onClose, onConfirm, terminalCount]);

  const focusCommandPresetAt = useCallback(
    (index) => {
      if (!commandApplies) return;
      const preset = COMMAND_PRESETS[index];
      if (!preset) return;
      handlePresetSelect(preset);
      const presetButton =
        presetButtonRefs.current[index] ||
        modalPanelRef.current?.querySelector(
          `[data-testid="workspace-terminal-command-preset-${preset.id}"]`
        );
      presetButton?.focus();
    },
    [commandApplies, handlePresetSelect]
  );

  const handleModalKeyDown = useCallback(
    (event) => {
      const modalRoot = modalPanelRef.current;
      const activeElement = document.activeElement;
      const resolvedSection =
        activeSection || resolveWorkspaceSetupSection(activeElement, modalRoot) || 'terminals';

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
        return;
      }

      if (shouldNavigateWorkspaceSetupSections(event, { activeElement, modalRoot })) {
        const delta = resolveSectionNavigationDelta(event);
        const nextSection = getAdjacentWorkspaceSetupSection(resolvedSection, delta, {
          commandApplies,
        });
        if (nextSection !== resolvedSection) {
          event.preventDefault();
          event.stopPropagation();
          setActiveSection(nextSection);
          focusWorkspaceSection(nextSection);
        }
        return;
      }

      if (
        shouldAdjustTerminalCountFromKeyboard(event, {
          activeSection: resolvedSection,
          activeElement,
          modalRoot,
        })
      ) {
        const delta = resolveTerminalCountDelta(event);
        if (delta !== 0) {
          event.preventDefault();
          event.stopPropagation();
          setTerminalCount((value) =>
            clampTerminalCount(value + delta, MIN_TERMINALS, MAX_TERMINALS)
          );
        }
        return;
      }

      if (
        shouldNavigateCommandPresetsFromKeyboard(event, {
          activeSection: resolvedSection,
          activeElement,
          modalRoot,
        })
      ) {
        const delta = resolveCommandPresetArrowDelta(event);
        if (delta === 0 || !commandApplies) return;

        const currentIndex = COMMAND_PRESETS.findIndex(
          (preset) => preset.id === activePresetId || preset.id === resolvedPresetId
        );
        const nextIndex = getAdjacentCircularIndex(
          currentIndex === -1 ? 0 : currentIndex,
          delta,
          COMMAND_PRESETS.length
        );

        event.preventDefault();
        event.stopPropagation();
        setActiveSection('commandPresets');
        focusCommandPresetAt(nextIndex);
        return;
      }

      if (shouldConfirmWorkspaceTerminalSetup(event, { activeElement, modalRoot })) {
        event.preventDefault();
        event.stopPropagation();
        handleConfirm();
      }
    },
    [
      activePresetId,
      activeSection,
      commandApplies,
      focusCommandPresetAt,
      focusWorkspaceSection,
      handleConfirm,
      onClose,
      resolvedPresetId,
    ]
  );

  useEffect(() => {
    if (!open) return undefined;

    const handleDocumentKeyDown = (event) => {
      const modalRoot = modalPanelRef.current;
      if (!modalRoot) return;

      const eventTarget = event.target && typeof event.target === 'object' ? event.target : null;
      const activeElement = document.activeElement;
      const targetInsideModal = Boolean(eventTarget && modalRoot.contains(eventTarget));
      const focusInsideModal = Boolean(activeElement && modalRoot.contains(activeElement));

      if (!targetInsideModal && !focusInsideModal) return;

      handleModalKeyDown(event);
    };

    document.addEventListener('keydown', handleDocumentKeyDown, true);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown, true);
  }, [handleModalKeyDown, open]);

  if (!open) return null;

  const sectionLabelStyle = {
    color: 'var(--text-muted)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Configurar terminales del workspace"
      data-testid="workspace-terminal-setup-modal"
      style={{ background: 'var(--chrome-overlay, rgba(0,0,0,0.6))' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={modalPanelRef}
        className="flex w-full max-w-lg flex-col overflow-hidden"
        style={panelStyle({ emphasized: true })}
        onKeyDown={handleModalKeyDown}
      >
        <div
          className="flex items-start justify-between gap-4 border-b px-6 py-5"
          style={panelHeaderStripStyle()}
        >
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1" style={pillStyle({ tone: 'accent' })}>
              <LayoutGrid size={12} />
              Nuevo workspace
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Configurar workspace</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Elegí cuántas terminales abrir y con qué comando deben iniciar.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onClose?.()}
            className="text-sm"
            style={btnSecondaryStyle()}
            data-workspace-terminal-setup-cancel="true"
          >
            Cancelar
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <section className="space-y-3" data-testid="workspace-terminal-count-section">
            <p style={sectionLabelStyle}>Terminales</p>

            <div
              className="flex items-center justify-center gap-4 rounded-xl border px-4 py-4"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'var(--chrome-control-fill)',
              }}
            >
              <button
                type="button"
                aria-label="Menos terminales"
                data-testid="workspace-terminal-count-decrement"
                onClick={decrement}
                disabled={terminalCount <= MIN_TERMINALS}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors disabled:opacity-40"
                style={{
                  background: 'var(--surface-card)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Minus size={16} />
              </button>

              <div
                ref={countFocusRef}
                tabIndex={0}
                onFocus={() => setActiveSection('terminals')}
                role="spinbutton"
                aria-valuemin={MIN_TERMINALS}
                aria-valuemax={MAX_TERMINALS}
                aria-valuenow={terminalCount}
                aria-label="Cantidad de terminales"
                data-testid="workspace-terminal-count-focus"
                className="min-w-[88px] rounded-lg text-center outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/35"
              >
                <p
                  className="text-4xl font-semibold tabular-nums"
                  style={{ color: 'var(--text-primary)' }}
                  data-testid="workspace-terminal-count-value"
                >
                  {terminalCount}
                </p>
                <p
                  className="text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {terminalCount === 1 ? 'terminal' : 'terminales'}
                </p>
              </div>

              <button
                type="button"
                aria-label="Más terminales"
                data-testid="workspace-terminal-count-increment"
                onClick={increment}
                disabled={terminalCount >= MAX_TERMINALS}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors disabled:opacity-40"
                style={{
                  background: 'var(--surface-card)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((count) => (
                <button
                  key={count}
                  type="button"
                  data-testid={`workspace-terminal-count-preset-${count}`}
                  onClick={() => setTerminalCount(count)}
                  className="rounded-md border px-2 py-2 text-sm font-medium transition-colors"
                  style={{
                    background:
                      terminalCount === count
                        ? 'color-mix(in srgb, var(--accent-primary) 18%, transparent)'
                        : 'var(--chrome-control-fill)',
                    borderColor:
                      terminalCount === count ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    color:
                      terminalCount === count ? 'var(--accent-primary)' : 'var(--text-primary)',
                  }}
                >
                  {count}
                </button>
              ))}
            </div>
          </section>

          <div className="h-px" style={{ background: 'var(--border-subtle)' }} />

          <section
            className={`space-y-3 ${commandApplies ? '' : 'opacity-55'}`}
            data-testid="workspace-terminal-command-section"
          >
            <div className="flex items-center justify-between gap-3">
              <p style={sectionLabelStyle}>Comando inicial</p>
              {!commandApplies ? (
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  No aplica sin terminales
                </span>
              ) : null}
            </div>

            <div
              className="grid grid-cols-3 gap-2"
              data-testid="workspace-terminal-command-presets"
            >
              {COMMAND_PRESETS.map(({ id, label, command, description, Icon }, index) => {
                const isActive =
                  commandApplies && (activePresetId === id || resolvedPresetId === id);
                return (
                  <button
                    key={id}
                    ref={(node) => {
                      presetButtonRefs.current[index] = node;
                    }}
                    type="button"
                    data-testid={`workspace-terminal-command-preset-${id}`}
                    disabled={!commandApplies}
                    onFocus={() => setActiveSection('commandPresets')}
                    onClick={() => handlePresetSelect({ id, command })}
                    className="flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed"
                    style={{
                      background: isActive
                        ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)'
                        : 'var(--chrome-control-fill)',
                      borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                    title={description}
                  >
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border"
                      style={{
                        borderColor: isActive
                          ? 'color-mix(in srgb, var(--accent-primary) 35%, transparent)'
                          : 'var(--border-subtle)',
                        color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                        background: 'var(--surface-card)',
                      }}
                    >
                      <Icon size={15} />
                    </span>
                    <span className="text-sm font-semibold">{label}</span>
                    <span
                      className="text-[11px] leading-snug"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {description}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5" data-testid="workspace-terminal-custom-command-section">
              <label
                htmlFor="workspace-terminal-initial-command"
                className="block text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                Comando personalizado
              </label>
              <input
                ref={commandInputRef}
                id="workspace-terminal-initial-command"
                type="text"
                value={initialCommand}
                onChange={handleCommandInputChange}
                onFocus={() => setActiveSection('customCommand')}
                disabled={!commandApplies}
                placeholder="ej. opencode, kimi, npm run dev"
                data-testid="workspace-terminal-initial-command-input"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: 'var(--chrome-control-fill)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {commandApplies
                  ? 'Cada terminal nueva ejecutará este comando al abrirse.'
                  : 'Creá al menos una terminal para usar un comando inicial.'}
              </p>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
          <p
            className="text-[10px] uppercase tracking-[0.16em]"
            style={{ color: 'var(--text-muted)' }}
          >
            ↑↓ secciones · ←→ ajustar · Enter crear
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onClose?.()}
              style={btnSecondaryStyle()}
              data-workspace-terminal-setup-cancel="true"
            >
              Cancelar
            </button>
            <button
              ref={confirmButtonRef}
              type="button"
              data-testid="workspace-terminal-setup-confirm"
              onClick={handleConfirm}
              style={btnPrimaryStyle()}
            >
              Crear workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modalContent;
  return createPortal(modalContent, document.body);
}
