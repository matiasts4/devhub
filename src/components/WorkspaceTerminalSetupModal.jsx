'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, LayoutGrid, Minus, Plus, Sparkles, Terminal } from 'lucide-react';

import {
  panelStyle,
  panelHeaderStripStyle,
  btnSecondaryStyle,
  btnPrimaryStyle,
  pillStyle,
} from '@/chrome/morphology';

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
    id: 'groc',
    label: 'Groc',
    command: 'groc',
    description: 'Inicia Groc en cada terminal',
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

  const commandApplies = terminalCount > 0;
  const resolvedPresetId = useMemo(() => resolvePresetId(initialCommand), [initialCommand]);

  useEffect(() => {
    if (!open) return;
    const nextCommand = normalizeInitialCommand(defaultInitialCommand) || 'opencode';
    setTerminalCount(1);
    setInitialCommand(nextCommand);
    setActivePresetId(resolvePresetId(nextCommand));
  }, [open, defaultInitialCommand]);

  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const decrement = () => setTerminalCount((value) => Math.max(MIN_TERMINALS, value - 1));
  const increment = () => setTerminalCount((value) => Math.min(MAX_TERMINALS, value + 1));

  const handlePresetSelect = (preset) => {
    setActivePresetId(preset.id);
    setInitialCommand(preset.command);
  };

  const handleCommandInputChange = (event) => {
    const nextValue = event.target.value;
    setInitialCommand(nextValue);
    setActivePresetId(resolvePresetId(nextValue));
  };

  const handleConfirm = () => {
    const trimmedCommand = normalizeInitialCommand(initialCommand);
    onConfirm?.({
      terminalCount,
      initialCommand: commandApplies && trimmedCommand ? trimmedCommand : null,
    });
    onClose?.();
  };

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
        className="flex w-full max-w-lg flex-col overflow-hidden"
        style={panelStyle({ emphasized: true })}
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
          >
            Cancelar
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <section className="space-y-3">
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

              <div className="min-w-[88px] text-center">
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

          <section className={`space-y-3 ${commandApplies ? '' : 'opacity-55'}`}>
            <div className="flex items-center justify-between gap-3">
              <p style={sectionLabelStyle}>Comando inicial</p>
              {!commandApplies ? (
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  No aplica sin terminales
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {COMMAND_PRESETS.map(({ id, label, command, description, Icon }) => {
                const isActive =
                  commandApplies && (activePresetId === id || resolvedPresetId === id);
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`workspace-terminal-command-preset-${id}`}
                    disabled={!commandApplies}
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

            <div className="space-y-1.5">
              <label
                htmlFor="workspace-terminal-initial-command"
                className="block text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                Comando personalizado
              </label>
              <input
                id="workspace-terminal-initial-command"
                type="text"
                value={initialCommand}
                onChange={handleCommandInputChange}
                disabled={!commandApplies}
                placeholder="ej. opencode, groc, npm run dev"
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

        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          <button type="button" onClick={() => onClose?.()} style={btnSecondaryStyle()}>
            Cancelar
          </button>
          <button
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
  );

  if (typeof document === 'undefined') return modalContent;
  return createPortal(modalContent, document.body);
}
