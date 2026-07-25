import { SurfaceCard, SurfacePill } from './SwarmSurfaceCard';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ZED_ORCHESTRATOR_TEMPLATE_ID,
  filterModelsForProgram,
} from '@/lib/operations/swarmControl';
import {
  btnDangerStyle,
  codeBlockStyle,
  inputStyle,
  panelHeaderStripStyle,
  panelStyle,
  selectStyle,
  sectionSurfaceStyle,
} from '../../chrome/morphology.js';

const STEP_ORDER = ['team', 'configure', 'launch'];

const STEP_META = [
  { id: 'team', label: 'Equipo', short: '1' },
  { id: 'configure', label: 'Configurar', short: '2' },
  { id: 'launch', label: 'Lanzar', short: '3' },
];

const SDD_PHASES = [
  { id: 'sdd-explore', label: 'Explore' },
  { id: 'sdd-propose', label: 'Propose' },
  { id: 'sdd-design', label: 'Design' },
  { id: 'sdd-spec', label: 'Spec' },
  { id: 'sdd-tasks', label: 'Tasks' },
  { id: 'sdd-apply', label: 'Apply' },
  { id: 'sdd-verify', label: 'Verify' },
  { id: 'sdd-archive', label: 'Archive' },
];

export function getWizardModalChromeStyle() {
  return {
    ...panelStyle({ emphasized: true }),
    color: 'var(--text-primary)',
  };
}

export function getWizardStepButtonStyle({ active = false } = {}) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '0.75rem',
    width: '100%',
    height: 'auto',
    padding: '0.75rem 1rem',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    background: active ? 'var(--chrome-control-fill-hover)' : 'var(--chrome-control-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    borderStyle: 'solid',
    borderRadius: 'var(--chrome-radius-control)',
    boxShadow: 'var(--chrome-shadow-control)',
    color: 'var(--text-primary)',
  };
}

export function getWizardStepIndexStyle({ active = false } = {}) {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.75rem',
    height: '1.75rem',
    padding: 0,
    flexShrink: 0,
    fontSize: '10px',
    fontWeight: 700,
    background: active ? 'var(--chrome-control-fill)' : 'var(--chrome-panel-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    borderStyle: 'solid',
    borderRadius: 'var(--chrome-radius-control)',
    boxShadow: 'var(--chrome-shadow-control)',
    color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
  };
}

export function getWizardPrimaryActionStyle() {
  return {
    ...getWizardStepButtonStyle({ active: true }),
    // Step rail uses width 100%; actions must NOT inherit that or they
    // crush sibling flex content (e.g. header title next to Cerrar).
    width: 'auto',
    minWidth: '6.5rem',
    justifyContent: 'center',
  };
}

export function getWizardSecondaryActionStyle() {
  return {
    ...getWizardStepButtonStyle({ active: false }),
    width: 'auto',
    minWidth: '5.5rem',
    justifyContent: 'center',
  };
}

/** Compact chrome control for header dismiss / inline toggles. */
export function getWizardHeaderActionStyle() {
  return {
    ...getWizardSecondaryActionStyle(),
    width: 'auto',
    minWidth: 0,
    padding: '0.5rem 0.9rem',
    flexShrink: 0,
  };
}

export function getWizardInsetPanelStyle({ emphasized = false } = {}) {
  return sectionSurfaceStyle({ emphasized });
}

export function getWizardFieldStyle() {
  return {
    ...inputStyle(),
    borderColor: 'var(--chrome-border-color)',
    boxShadow: 'var(--chrome-shadow-control)',
  };
}

export function getWizardDangerBannerStyle() {
  return {
    background: 'color-mix(in srgb, var(--danger) 12%, var(--chrome-panel-fill))',
    borderColor: 'color-mix(in srgb, var(--danger) 42%, var(--chrome-border-color))',
    borderWidth: 'var(--chrome-border-width)',
    borderStyle: 'solid',
    borderRadius: 'var(--chrome-radius-panel)',
    boxShadow: 'var(--chrome-shadow-control)',
    color: 'var(--danger)',
  };
}

const wizardFieldStyle = getWizardFieldStyle();
const wizardSelectFieldStyle = selectStyle();
const wizardHeaderRailStyle = panelHeaderStripStyle();
const wizardLeftRailStyle = {
  borderRightColor: 'var(--chrome-border-color)',
  borderRightWidth: 'var(--chrome-border-width)',
};
const wizardRightRailStyle = {
  borderLeftColor: 'var(--chrome-border-color)',
  borderLeftWidth: 'var(--chrome-border-width)',
};

function FieldLabel({ children, hint }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-medium">{children}</span>
      {hint ? (
        <span
          className="text-[11px] font-normal leading-snug"
          style={{ color: 'var(--text-muted)' }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function SectionTitle({ children, description }) {
  return (
    <div className="space-y-1">
      <h3
        className="text-xs font-semibold uppercase tracking-[0.16em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {children}
      </h3>
      {description ? (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

function TopologyPreview({ topology }) {
  if (!topology) {
    return (
      <div className="border p-3 text-sm sm:p-4" style={getWizardInsetPanelStyle()}>
        Sin topología reusable definida todavía.
      </div>
    );
  }

  return (
    <div className="border p-3 sm:p-4" style={getWizardInsetPanelStyle({ emphasized: true })}>
      <div className="flex flex-wrap items-center gap-2">
        {(topology.roles || []).map((role, index) => (
          <React.Fragment key={role}>
            <SurfacePill tone={index === 0 ? 'accent' : 'neutral'}>{role}</SurfacePill>
            {index < topology.roles.length - 1 ? (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                →
              </span>
            ) : null}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-3 space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        {(topology.connections || []).map((connection) => (
          <div key={connection}>{connection}</div>
        ))}
      </div>
    </div>
  );
}

function StepButton({ step, currentStep, label, index, onClick }) {
  const active = currentStep === step;
  const unlocked = STEP_ORDER.indexOf(currentStep) >= index;

  return (
    <button
      type="button"
      disabled={!unlocked}
      onClick={() => onClick(step)}
      className="text-left disabled:cursor-not-allowed disabled:opacity-50"
      style={getWizardStepButtonStyle({ active })}
    >
      <span style={getWizardStepIndexStyle({ active })}>{index + 1}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

function CompactStepRail({ currentStep, onStepChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
      {STEP_META.map((step, index) => {
        const active = currentStep === step.id;
        const unlocked = STEP_ORDER.indexOf(currentStep) >= index;
        return (
          <button
            key={step.id}
            type="button"
            disabled={!unlocked}
            onClick={() => onStepChange(step.id)}
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              ...getWizardStepButtonStyle({ active }),
              width: 'auto',
              padding: '0.5rem 0.75rem',
            }}
          >
            <span style={getWizardStepIndexStyle({ active })}>{step.short}</span>
            {step.label}
          </button>
        );
      })}
    </div>
  );
}

function RoleRuntimeCard({
  entry,
  programs,
  models,
  currentModel,
  onProgramChange,
  onModelChange,
}) {
  const program = programs.find((p) => p.id === entry.program_id) || null;
  const supportsModel = program?.supports_model !== false;
  const filteredModels = filterModelsForProgram(models, entry.program_id);

  return (
    <div className="border p-3" style={getWizardInsetPanelStyle({ emphasized: true })}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{entry.role}</span>
        {program ? (
          <SurfacePill tone="accent">{program.label}</SurfacePill>
        ) : (
          <SurfacePill>Sin TUI</SurfacePill>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium">
          <span>Cliente TUI</span>
          <select
            aria-label={`Programa para ${entry.role}`}
            value={entry.program_id || ''}
            onChange={(event) => onProgramChange(event.target.value)}
            className="w-full text-xs"
            style={wizardSelectFieldStyle}
          >
            {programs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium">
          <span>Modelo</span>
          <select
            aria-label={`Modelo para ${entry.role}`}
            value={supportsModel ? currentModel || '' : ''}
            disabled={!supportsModel}
            onChange={(event) => onModelChange(event.target.value)}
            className="w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
            style={wizardSelectFieldStyle}
          >
            {!supportsModel ? (
              <option value="">Sin modelo (TUI nativa)</option>
            ) : (
              <>
                <option value="">Default del perfil</option>
                {filteredModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>
      </div>
      {program?.summary ? (
        <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
          {program.summary}
        </p>
      ) : null}
    </div>
  );
}

function WizardActions({
  currentStep,
  onStepChange,
  onLaunch,
  onSubmitStateChange,
  preview,
  submitState,
  className = '',
  fullWidth = true,
}) {
  const stretch = fullWidth ? { width: '100%' } : {};
  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-stretch ${className}`}>
      {currentStep !== 'team' ? (
        <button
          type="button"
          onClick={() => onStepChange(STEP_ORDER[Math.max(0, STEP_ORDER.indexOf(currentStep) - 1)])}
          className="text-sm font-medium sm:flex-1"
          style={{ ...getWizardSecondaryActionStyle(), ...stretch }}
        >
          Volver
        </button>
      ) : null}

      {currentStep !== 'launch' ? (
        <button
          type="button"
          onClick={() =>
            onStepChange(
              STEP_ORDER[Math.min(STEP_ORDER.length - 1, STEP_ORDER.indexOf(currentStep) + 1)]
            )
          }
          className="text-sm font-medium sm:flex-1"
          style={{ ...getWizardPrimaryActionStyle(), ...stretch }}
        >
          Siguiente
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            onSubmitStateChange?.({ submitting: false, error: null });
            onLaunch?.();
          }}
          disabled={!preview?.isReady || submitState?.submitting}
          className="text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1"
          style={{ ...getWizardPrimaryActionStyle(), ...stretch }}
        >
          {submitState?.submitting
            ? 'Lanzando…'
            : preview?.isReady
              ? 'Lanzar swarm local'
              : 'Completá configuración'}
        </button>
      )}
    </div>
  );
}

function SnapshotSummary({ preview, draft }) {
  return (
    <SurfaceCard className="p-3 sm:p-4">
      <p className="text-sm font-semibold">Resumen snapshot</p>
      <div
        className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 xl:grid-cols-1"
        style={{ color: 'var(--text-secondary)' }}
      >
        <div>Modo · {preview?.modeLabel || 'Equipo plantilla'}</div>
        <div>Categoría · {preview?.category?.label || 'Sin categoría'}</div>
        <div>Estrategia · {preview?.launchStrategyLabel || 'Bootstrap director primero'}</div>
        <div>Inicialización · {preview?.bootstrapModeLabel || 'Engram primero'}</div>
        <div className="sm:col-span-2 xl:col-span-1 break-all">
          Ruta · {draft.workspacePath || 'Sin ruta'}
        </div>
      </div>
    </SurfaceCard>
  );
}

export default function SwarmLaunchWizardModal({
  open,
  catalog,
  preview,
  currentStep,
  onClose,
  onStepChange,
  onDraftChange,
  onLaunch,
  submitState,
  onSubmitStateChange,
}) {
  const [showPayload, setShowPayload] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setShowPayload(false);
      setShowMobilePreview(false);
    }
  }, [open]);

  const draft = preview?.draft || {};
  const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
  const templates = Array.isArray(catalog?.templates) ? catalog.templates : [];
  const swarmTypes = Array.isArray(catalog?.swarm_types) ? catalog.swarm_types : [];
  const teams = Array.isArray(catalog?.teams) ? catalog.teams : [];
  const providers = Array.isArray(catalog?.providers) ? catalog.providers : [];
  const programs = Array.isArray(catalog?.programs) ? catalog.programs : [];
  const models = Array.isArray(catalog?.models) ? catalog.models : [];
  const launchStrategies = Array.isArray(catalog?.launch_strategies)
    ? catalog.launch_strategies
    : [];
  const bootstrapModes = Array.isArray(catalog?.bootstrap_modes) ? catalog.bootstrap_modes : [];

  const isZedPodTemplate = draft.templateId === ZED_ORCHESTRATOR_TEMPLATE_ID;

  const stepDescription = useMemo(() => {
    if (currentStep === 'team') return 'Elegí base operativa: template team o custom team.';
    if (currentStep === 'configure') {
      return isZedPodTemplate
        ? 'ZED + SDD Workers en standby. Ajustá TUI, modelos y ruta; el trabajo empieza cuando hables con ZED.'
        : 'Ajustá TUI por rol, modelo y defaults snapshot-first antes de lanzar.';
    }
    return 'Revisá summary, topología y payload local del launch.';
  }, [currentStep, isZedPodTemplate]);

  const applyDefaultModelToRoles = (modelId) => {
    const nextModels = { ...(draft.roleModels || {}) };
    (preview?.rolePrograms || []).forEach((entry) => {
      if (entry?.role_key) nextModels[entry.role_key] = modelId;
    });
    onDraftChange({
      providerId: modelId,
      roleModels: nextModels,
    });
  };

  if (!open) return null;

  const errorBanner =
    submitState?.error && currentStep === 'launch' ? (
      <div className="border px-3 py-2 text-sm font-medium" style={getWizardDangerBannerStyle()}>
        <div>{submitState.error}</div>
        {submitState.error.includes('swarm activo') ? (
          <button
            type="button"
            className="mt-2 text-xs font-semibold"
            style={{
              ...btnDangerStyle({ size: 'xs' }),
              textTransform: 'none',
              letterSpacing: 'normal',
              color: 'var(--danger)',
              background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
              borderColor: 'color-mix(in srgb, var(--danger) 42%, var(--chrome-border-color))',
              boxShadow: 'var(--chrome-shadow-control)',
            }}
            onClick={async () => {
              try {
                const res = await fetch('/api/swarm/processes', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'abort_all_active' }),
                });
                if (res.ok) {
                  onSubmitStateChange?.({ submitting: false, error: null });
                }
              } catch {
                // ignore
              }
            }}
          >
            Forzar cancelación de misión activa
          </button>
        ) : null}
      </div>
    ) : null;

  const previewColumn = (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Vista previa de topología</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Reutilizable para launch y handoff inicial.
        </p>
      </div>
      <TopologyPreview topology={preview?.topology} />
      <SnapshotSummary preview={preview} draft={draft} />
      <div className="hidden xl:block">
        <WizardActions
          currentStep={currentStep}
          onStepChange={onStepChange}
          onLaunch={onLaunch}
          onSubmitStateChange={onSubmitStateChange}
          preview={preview}
          submitState={submitState}
        />
        {errorBanner}
      </div>
    </div>
  );

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center p-0 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
      role="dialog"
      aria-modal="true"
      data-devhub-modal="true"
      data-state="open"
      aria-label="Launch wizard de swarm"
      style={{ background: 'var(--chrome-overlay, rgba(0,0,0,0.6))' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="flex h-[min(100dvh,100%)] w-full max-w-6xl flex-col overflow-hidden border sm:h-[min(88dvh,860px)] sm:rounded-[var(--chrome-radius-panel)]"
        style={getWizardModalChromeStyle()}
        data-testid="swarm-launch-wizard-modal-panel"
      >
        {/* Header — compact single band; close must never be width:100% */}
        <div
          className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3 sm:px-5 sm:py-3.5"
          style={wizardHeaderRailStyle}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <SurfacePill tone="accent">Asistente de lanzamiento</SurfacePill>
              <SurfacePill>{preview?.modeLabel || 'Template team'}</SurfacePill>
              <SurfacePill>{preview?.category?.label || 'Sin categoría'}</SurfacePill>
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                {preview?.launchLabel || 'Configurar lanzamiento'}
              </h2>
              <p
                className="mt-0.5 line-clamp-2 text-sm leading-snug"
                style={{ color: 'var(--text-secondary)' }}
              >
                {stepDescription}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onClose?.()}
            className="shrink-0 text-sm font-medium"
            style={getWizardHeaderActionStyle()}
          >
            Cerrar
          </button>
        </div>

        {/* Mobile steps */}
        <div className="shrink-0 border-b px-4 py-2.5 lg:hidden">
          <CompactStepRail currentStep={currentStep} onStepChange={onStepChange} />
        </div>

        {/* Body fills remaining height; columns share one row from the top */}
        <div className="grid min-h-0 flex-1 grid-rows-1 overflow-hidden lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_280px]">
          {/* Left steps (desktop) */}
          <aside
            className="hidden min-h-0 overflow-y-auto border-r p-3 lg:flex lg:flex-col lg:gap-3"
            style={wizardLeftRailStyle}
          >
            <div className="space-y-2">
              {STEP_META.map((step, index) => (
                <StepButton
                  key={step.id}
                  step={step.id}
                  currentStep={currentStep}
                  label={step.label}
                  index={index}
                  onClick={onStepChange}
                />
              ))}
            </div>

            <div className="mt-auto border p-3 text-sm" style={getWizardInsetPanelStyle()}>
              <p className="font-medium">Topología reusable</p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Roster y conexiones forman parte del launch, no decoración.
              </p>
            </div>
          </aside>

          {/* Main */}
          <main className="min-h-0 overflow-y-auto p-4 sm:p-5">
            {currentStep === 'team' ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                  {[
                    {
                      id: 'template',
                      title: 'Template team',
                      summary: 'Partí de una plantilla operativa con topología y misión sugeridas.',
                    },
                    {
                      id: 'custom',
                      title: 'Custom team',
                      summary:
                        'Tomá una plantilla como base pero elegí team y swarm type manualmente.',
                    },
                  ].map((option) => {
                    const selected = draft.mode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onDraftChange({ mode: option.id })}
                        aria-pressed={selected}
                        className="text-left"
                      >
                        <SurfaceCard emphasized={selected} className="h-full p-4 sm:p-5">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-base font-semibold">{option.title}</h3>
                            {selected ? <SurfacePill tone="accent">Activo</SurfacePill> : null}
                          </div>
                          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {option.summary}
                          </p>
                        </SurfaceCard>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <SectionTitle description="Plantillas listadas primero por recomendación del control room.">
                    Plantillas de launchpad
                  </SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {templates.map((template) => {
                      const selected = template.id === draft.templateId;
                      const isFeatured = Boolean(template.featured);
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() =>
                            onDraftChange({
                              templateId: template.id,
                              mode: 'template',
                              category: template.category || draft.category,
                              swarmTypeId: template.swarm_type_id || draft.swarmTypeId,
                              teamId: template.default_team_id || draft.teamId,
                              ...(template.launch_defaults || {}),
                            })
                          }
                          aria-pressed={selected}
                          className="text-left"
                          style={
                            isFeatured
                              ? {
                                  gridColumn: templates.length > 1 ? '1 / -1' : undefined,
                                }
                              : undefined
                          }
                        >
                          <SurfaceCard emphasized={selected || isFeatured} className="h-full p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-sm font-semibold">{template.label}</h4>
                              <div className="flex flex-wrap gap-2">
                                {isFeatured ? <SurfacePill tone="accent">Nuevo</SurfacePill> : null}
                                {selected ? <SurfacePill>Base</SurfacePill> : null}
                              </div>
                            </div>
                            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {template.summary}
                            </p>
                            {isFeatured ? (
                              <p
                                className="mt-2 text-xs font-medium"
                                style={{ color: 'var(--accent-cyan, var(--accent-primary))' }}
                              >
                                ZED delega · Workers usan gentle-orchestrator · Standby al launch
                              </p>
                            ) : null}
                          </SurfaceCard>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {currentStep === 'configure' ? (
              <div className="space-y-6">
                {isZedPodTemplate ? (
                  <div
                    className="border p-4 text-sm"
                    style={getWizardInsetPanelStyle({ emphasized: true })}
                  >
                    <p className="font-medium">ZED Orchestrator Pod — modo standby</p>
                    <p className="mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      Se abrirán terminales para ZED y SDD Workers sin trabajo asignado. Conversá
                      con ZED para delegar changes; cada worker ejecuta el SDD estándar vía{' '}
                      <code>gentle-orchestrator</code>.
                    </p>
                  </div>
                ) : null}

                {/* Identity */}
                <section className="space-y-3">
                  <SectionTitle description="Identidad del launch y team base.">
                    Identidad
                  </SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {isZedPodTemplate ? (
                      <label className="space-y-2 text-sm font-medium">
                        <FieldLabel>SDD Workers (1–4)</FieldLabel>
                        <select
                          aria-label="Cantidad de SDD Workers"
                          value={String(draft.workerCount || 4)}
                          onChange={(event) =>
                            onDraftChange({ workerCount: Number(event.target.value) })
                          }
                          className="w-full"
                          style={wizardSelectFieldStyle}
                        >
                          {[1, 2, 3, 4].map((count) => (
                            <option key={count} value={count}>
                              {count} worker{count > 1 ? 's' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <label className="space-y-2 text-sm font-medium">
                      <FieldLabel>Categoría</FieldLabel>
                      <select
                        aria-label="Categoría de lanzamiento"
                        value={draft.category || ''}
                        onChange={(event) => onDraftChange({ category: event.target.value })}
                        className="w-full"
                        style={wizardSelectFieldStyle}
                      >
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 text-sm font-medium">
                      <FieldLabel>Tipo de swarm</FieldLabel>
                      <select
                        aria-label="Tipo de swarm"
                        value={draft.swarmTypeId || ''}
                        onChange={(event) => onDraftChange({ swarmTypeId: event.target.value })}
                        className="w-full"
                        style={wizardSelectFieldStyle}
                      >
                        {swarmTypes.map((swarmType) => (
                          <option key={swarmType.id} value={swarmType.id}>
                            {swarmType.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 text-sm font-medium">
                      <FieldLabel>Plantilla</FieldLabel>
                      <select
                        aria-label="Plantilla de lanzamiento"
                        value={draft.templateId || ''}
                        onChange={(event) => onDraftChange({ templateId: event.target.value })}
                        className="w-full"
                        style={wizardSelectFieldStyle}
                      >
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 text-sm font-medium">
                      <FieldLabel>Equipo</FieldLabel>
                      <select
                        aria-label="Equipo predefinido"
                        value={draft.teamId || ''}
                        onChange={(event) =>
                          onDraftChange({ teamId: event.target.value, mode: 'custom' })
                        }
                        className="w-full"
                        style={wizardSelectFieldStyle}
                      >
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                {/* Runtime TUI + models */}
                <section className="space-y-3">
                  <SectionTitle description="Solo clientes TUI que el launcher puede spawnear (OpenCode, Kimi, Codex, Hermes, Grok). El modelo aplica a TUIs que soportan --model.">
                    Runtime por rol
                  </SectionTitle>

                  <label className="block max-w-xl space-y-2 text-sm font-medium">
                    <FieldLabel hint="Se aplica a todos los roles; podés sobreescribir por rol abajo.">
                      Modelo por defecto
                    </FieldLabel>
                    <select
                      aria-label="Modelo proveedor"
                      value={draft.providerId || ''}
                      onChange={(event) => applyDefaultModelToRoles(event.target.value)}
                      className="w-full"
                      style={wizardSelectFieldStyle}
                    >
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                          {provider.stack ? ` · ${provider.stack}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-3 md:grid-cols-2">
                    {(preview?.rolePrograms || []).map((entry) => (
                      <RoleRuntimeCard
                        key={entry.role_key}
                        entry={entry}
                        programs={programs}
                        models={models}
                        currentModel={draft.roleModels?.[entry.role_key] || ''}
                        onProgramChange={(programId) =>
                          onDraftChange({
                            rolePrograms: {
                              ...(draft.rolePrograms || {}),
                              [entry.role_key]: programId,
                            },
                          })
                        }
                        onModelChange={(modelId) =>
                          onDraftChange({
                            roleModels: {
                              ...(draft.roleModels || {}),
                              [entry.role_key]: modelId,
                            },
                          })
                        }
                      />
                    ))}
                  </div>
                </section>

                {/* Launch policy */}
                <section className="space-y-3">
                  <SectionTitle description="Cómo se materializan paneles y bootstrap inicial.">
                    Política de launch
                  </SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-medium">
                      <FieldLabel>Estrategia de lanzamiento</FieldLabel>
                      <select
                        aria-label="Estrategia de lanzamiento"
                        value={draft.launchStrategy || ''}
                        onChange={(event) => onDraftChange({ launchStrategy: event.target.value })}
                        className="w-full"
                        style={wizardSelectFieldStyle}
                      >
                        {launchStrategies.map((strategy) => (
                          <option key={strategy.id} value={strategy.id}>
                            {strategy.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 text-sm font-medium">
                      <FieldLabel>Modo de inicialización</FieldLabel>
                      <select
                        aria-label="Modo de inicialización"
                        value={draft.bootstrapMode || ''}
                        onChange={(event) => onDraftChange({ bootstrapMode: event.target.value })}
                        className="w-full"
                        style={wizardSelectFieldStyle}
                      >
                        {bootstrapModes.map((mode) => (
                          <option key={mode.id} value={mode.id}>
                            {mode.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 text-sm font-medium">
                      <FieldLabel>Estrategia de spawn</FieldLabel>
                      <select
                        aria-label="Spawn strategy"
                        value={draft.spawnStrategy || 'lazy-on-demand'}
                        onChange={(event) => onDraftChange({ spawnStrategy: event.target.value })}
                        className="w-full"
                        style={wizardSelectFieldStyle}
                      >
                        <option value="lazy-on-demand">
                          Lazy — grid crece al delegar (recomendado)
                        </option>
                        <option value="automatic">Automatic — todos los paneles al lanzar</option>
                      </select>
                    </label>

                    <label className="space-y-2 text-sm font-medium sm:col-span-2">
                      <FieldLabel>Ruta operativa</FieldLabel>
                      <input
                        aria-label="Ruta del workspace"
                        value={draft.workspacePath || ''}
                        onChange={(event) => onDraftChange({ workspacePath: event.target.value })}
                        className="w-full"
                        style={wizardFieldStyle}
                      />
                    </label>
                  </div>
                </section>

                {/* SDD + mission */}
                {!isZedPodTemplate ? (
                  <section className="space-y-3">
                    <SectionTitle>Misión y SDD</SectionTitle>
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label="Enable SDD mode"
                          checked={draft.sddEnabled || false}
                          onChange={(event) => onDraftChange({ sddEnabled: event.target.checked })}
                          className="h-4 w-4 accent-[var(--accent-primary)]"
                        />
                        <span>Modo SDD</span>
                      </label>

                      {draft.sddEnabled ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-2 text-sm font-medium">
                            <FieldLabel>Nombre del cambio</FieldLabel>
                            <input
                              aria-label="Change name"
                              value={draft.changeName || ''}
                              onChange={(event) =>
                                onDraftChange({ changeName: event.target.value })
                              }
                              placeholder="e.g. swarm-sdd-integration"
                              className="w-full"
                              style={wizardFieldStyle}
                            />
                          </label>
                          <label className="space-y-2 text-sm font-medium">
                            <FieldLabel>Fase inicial</FieldLabel>
                            <select
                              aria-label="Initial SDD phase"
                              value={draft.phase || ''}
                              onChange={(event) => onDraftChange({ phase: event.target.value })}
                              className="w-full"
                              style={wizardSelectFieldStyle}
                            >
                              <option value="">Seleccionar fase...</option>
                              {SDD_PHASES.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}

                      <label className="block space-y-2 text-sm font-medium">
                        <FieldLabel>Misión</FieldLabel>
                        <textarea
                          aria-label="Launch mission"
                          value={draft.mission || ''}
                          onChange={(event) => onDraftChange({ mission: event.target.value })}
                          rows={4}
                          className="w-full"
                          style={wizardFieldStyle}
                        />
                      </label>
                    </div>
                  </section>
                ) : null}

                {/* Mobile preview toggle */}
                <div className="xl:hidden">
                  <button
                    type="button"
                    onClick={() => setShowMobilePreview((v) => !v)}
                    className="w-full text-sm font-medium"
                    style={getWizardSecondaryActionStyle()}
                  >
                    {showMobilePreview ? 'Ocultar topología' : 'Ver topología y resumen'}
                  </button>
                  {showMobilePreview ? <div className="mt-3">{previewColumn}</div> : null}
                </div>
              </div>
            ) : null}

            {currentStep === 'launch' ? (
              <div className="space-y-5">
                <SurfaceCard emphasized className="p-4 sm:p-5">
                  <div className="flex flex-wrap gap-2">
                    <SurfacePill tone="accent">Resumen</SurfacePill>
                    <SurfacePill>{preview?.template?.label || 'Sin plantilla'}</SurfacePill>
                    <SurfacePill>{preview?.team?.label || 'Sin team'}</SurfacePill>
                    <SurfacePill>{preview?.provider?.label || 'Sin modelo'}</SurfacePill>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {preview?.summaryLines?.map((line) => (
                      <div
                        key={line}
                        className="border px-3 py-3 text-sm"
                        style={getWizardInsetPanelStyle()}
                      >
                        {line}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="border px-3 py-3 text-sm" style={getWizardInsetPanelStyle()}>
                      Estrategia · {preview?.launchStrategyLabel || 'Bootstrap director primero'}
                    </div>
                    <div className="border px-3 py-3 text-sm" style={getWizardInsetPanelStyle()}>
                      Inicialización · {preview?.bootstrapModeLabel || 'Engram primero'}
                    </div>
                  </div>
                </SurfaceCard>

                <div className="grid gap-4 sm:grid-cols-2">
                  <SurfaceCard className="p-4 sm:p-5">
                    <p className="text-sm font-semibold">Equipo planificado</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(preview?.topology?.roles || []).map((role) => (
                        <SurfacePill key={role}>{role}</SurfacePill>
                      ))}
                    </div>
                  </SurfaceCard>

                  <SurfaceCard className="p-4 sm:p-5">
                    <p className="text-sm font-semibold">TUI por rol</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(preview?.rolePrograms || []).map((entry) => (
                        <SurfacePill key={entry.role_key}>
                          {entry.role} · {entry.program_label}
                        </SurfacePill>
                      ))}
                    </div>
                  </SurfaceCard>
                </div>

                <SurfaceCard className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Payload local</p>
                    <button
                      type="button"
                      onClick={() => setShowPayload((v) => !v)}
                      className="text-xs font-semibold"
                      style={getWizardSecondaryActionStyle()}
                    >
                      {showPayload ? 'Ocultar JSON' : 'Mostrar JSON'}
                    </button>
                  </div>
                  {showPayload ? (
                    <pre
                      className="mt-3 max-h-64 overflow-auto text-xs"
                      style={{ ...codeBlockStyle(), color: 'var(--text-muted)' }}
                    >
                      {JSON.stringify(draft, null, 2)}
                    </pre>
                  ) : (
                    <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      El payload se envía tal cual al launch local. Expandí solo si necesitás
                      auditar.
                    </p>
                  )}
                </SurfaceCard>

                <div className="xl:hidden">
                  <button
                    type="button"
                    onClick={() => setShowMobilePreview((v) => !v)}
                    className="w-full text-sm font-medium"
                    style={getWizardSecondaryActionStyle()}
                  >
                    {showMobilePreview ? 'Ocultar topología' : 'Ver topología y resumen'}
                  </button>
                  {showMobilePreview ? <div className="mt-3">{previewColumn}</div> : null}
                </div>
              </div>
            ) : null}
          </main>

          {/* Right preview (xl+) */}
          <aside
            className="hidden min-h-0 overflow-y-auto border-l p-4 xl:block xl:p-5"
            style={wizardRightRailStyle}
          >
            {previewColumn}
          </aside>
        </div>

        {/* Sticky footer actions (below xl where right rail hides primary CTA) */}
        <div
          className="shrink-0 border-t px-4 py-3 sm:px-5 xl:hidden"
          style={wizardHeaderRailStyle}
        >
          <WizardActions
            currentStep={currentStep}
            onStepChange={onStepChange}
            onLaunch={onLaunch}
            onSubmitStateChange={onSubmitStateChange}
            preview={preview}
            submitState={submitState}
          />
          {errorBanner ? <div className="mt-2">{errorBanner}</div> : null}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modal, document.body);
  }

  return modal;
}
