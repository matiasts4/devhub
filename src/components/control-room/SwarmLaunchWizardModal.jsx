import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SurfaceCard, SurfacePill } from './SwarmSurfaceCard';
import {
  btnDangerStyle,
  btnPrimaryStyle,
  btnSecondaryStyle,
  codeBlockStyle,
  dangerBannerStyle,
  inputStyle,
  panelStyle,
  pillStyle,
  selectStyle,
  sectionSurfaceStyle,
} from '../../chrome/morphology.js';

const STEP_ORDER = ['team', 'configure', 'launch'];

const modalChromeStyle = {
  ...panelStyle({ emphasized: true }),
  color: 'var(--text-primary)',
  borderRadius: '0',
};

function wizardInsetPanelStyle({ emphasized = false } = {}) {
  return sectionSurfaceStyle({ emphasized });
}

const wizardFieldStyle = inputStyle();
const wizardSelectFieldStyle = selectStyle();
const wizardHeaderRailStyle = {
  borderBottomColor: 'var(--border-subtle)',
  borderBottomWidth: 'var(--chrome-border-width)',
};
const wizardLeftRailStyle = {
  borderRightColor: 'var(--border-subtle)',
  borderRightWidth: 'var(--chrome-border-width)',
};
const wizardRightRailStyle = {
  borderLeftColor: 'var(--border-subtle)',
  borderLeftWidth: 'var(--chrome-border-width)',
};

function TopologyPreview({ topology }) {
  if (!topology) {
    return (
      <div
        className="border p-4 text-sm"
        style={wizardInsetPanelStyle()}
      >
        Sin topología reusable definida todavía.
      </div>
    );
  }

  return (
    <div className="border p-4" style={wizardInsetPanelStyle({ emphasized: true })}>
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
      className="flex items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        ...(active ? btnPrimaryStyle({ size: 'md' }) : btnSecondaryStyle({ size: 'md' })),
        width: '100%',
        height: 'auto',
        justifyContent: 'flex-start',
        padding: '0.75rem 1rem',
        textAlign: 'left',
        textTransform: 'none',
        letterSpacing: 'normal',
      }}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
        style={{
          ...pillStyle({ tone: active ? 'accent' : 'neutral' }),
          width: '1.75rem',
          height: '1.75rem',
          padding: 0,
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {index + 1}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </button>
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
  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  const draft = preview?.draft || {};
  const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
  const templates = Array.isArray(catalog?.templates) ? catalog.templates : [];
  const swarmTypes = Array.isArray(catalog?.swarm_types) ? catalog.swarm_types : [];
  const teams = Array.isArray(catalog?.teams) ? catalog.teams : [];
  const providers = Array.isArray(catalog?.providers) ? catalog.providers : [];
  const programs = Array.isArray(catalog?.programs) ? catalog.programs : [];
  const launchStrategies = Array.isArray(catalog?.launch_strategies) ? catalog.launch_strategies : [];
  const bootstrapModes = Array.isArray(catalog?.bootstrap_modes) ? catalog.bootstrap_modes : [];

  const stepDescription = useMemo(() => {
    if (currentStep === 'team') return 'Elegí base operativa: template team o custom team.';
    if (currentStep === 'configure') return 'Ajustá defaults snapshot-first antes de lanzar.';
    return 'Revisá summary, topología y payload local del launch.';
  }, [currentStep]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Launch wizard de swarm"
      style={{ background: 'var(--chrome-overlay, rgba(0,0,0,0.6))' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-none border"
        style={modalChromeStyle}
      >
        <div
          className="flex items-start justify-between gap-4 border-b px-6 py-5"
          style={wizardHeaderRailStyle}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <SurfacePill tone="accent">Launch wizard</SurfacePill>
              <SurfacePill>{preview?.modeLabel || 'Template team'}</SurfacePill>
              <SurfacePill>{preview?.category?.label || 'Sin categoría'}</SurfacePill>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {preview?.launchLabel || 'Configurar launch'}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {stepDescription}
              </p>
            </div>
          </div>

            <button
              type="button"
              onClick={() => onClose?.()}
              className="text-sm"
              style={{
                ...btnSecondaryStyle(),
                borderRadius: '0',
                textTransform: 'none',
                letterSpacing: 'normal',
              }}
            >
              Cerrar
            </button>
        </div>

        <div className="grid flex-1 gap-0 overflow-hidden xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside
            className="border-r p-4"
            style={wizardLeftRailStyle}
          >
            <div className="space-y-3">
              <StepButton
                step="team"
                currentStep={currentStep}
                label="Team"
                index={0}
                onClick={onStepChange}
              />
              <StepButton
                step="configure"
                currentStep={currentStep}
                label="Configure"
                index={1}
                onClick={onStepChange}
              />
              <StepButton
                step="launch"
                currentStep={currentStep}
                label="Launch"
                index={2}
                onClick={onStepChange}
              />
            </div>

            <div
              className="mt-6 border p-4 text-sm"
              style={wizardInsetPanelStyle()}
            >
              <p className="font-medium">Topología reusable</p>
              <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                Mostramos roster y conexiones como parte del launch, no como dato decorativo.
              </p>
            </div>
          </aside>

          <main className="overflow-y-auto p-5">
            {currentStep === 'team' ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
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
                        <SurfaceCard emphasized={selected} className="h-full p-5">
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
                  <h3
                    className="text-sm font-semibold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Plantillas de launchpad
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {templates.map((template) => {
                      const selected = template.id === draft.templateId;

                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() =>
                            onDraftChange({ templateId: template.id, mode: 'template' })
                          }
                          aria-pressed={selected}
                          className="text-left"
                        >
                          <SurfaceCard emphasized={selected} className="h-full p-4">
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="text-sm font-semibold">{template.label}</h4>
                              {selected ? <SurfacePill tone="accent">Base</SurfacePill> : null}
                            </div>
                            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {template.summary}
                            </p>
                          </SurfaceCard>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {currentStep === 'configure' ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium">
                    <span>Category</span>
                    <select
                      aria-label="Launch category"
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
                    <span>Swarm type</span>
                    <select
                      aria-label="Swarm type"
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
                    <span>Template</span>
                    <select
                      aria-label="Launch template"
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
                    <span>Team</span>
                    <select
                      aria-label="Team preset"
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

                  <label className="space-y-2 text-sm font-medium">
                    <span>Provider</span>
                    <select
                      aria-label="Provider model"
                      value={draft.providerId || ''}
                      onChange={(event) => onDraftChange({ providerId: event.target.value })}
                        className="w-full"
                        style={wizardSelectFieldStyle}
                     >
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    <span>Launch strategy</span>
                    <select
                      aria-label="Launch strategy"
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
                    <span>Bootstrap mode</span>
                    <select
                      aria-label="Bootstrap mode"
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

                  <div className="space-y-3 md:col-span-2">
                    <div>
                      <p className="text-sm font-medium">Programa y modelo por rol</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        Elegí qué cliente y qué modelo usa cada rol del swarm antes del launch.
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {(preview?.rolePrograms || []).map((entry) => {
                        const roleModels = Array.isArray(catalog?.models) ? catalog.models : [];
                        const currentModel = draft.roleModels?.[entry.role_key] || '';

                        return (
                          <div key={entry.role_key} className="space-y-2">
                            <span className="text-sm font-medium">{entry.role}</span>
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                aria-label={`Programa para ${entry.role}`}
                                value={entry.program_id || ''}
                                onChange={(event) =>
                                  onDraftChange({
                                    rolePrograms: {
                                      ...(draft.rolePrograms || {}),
                                      [entry.role_key]: event.target.value,
                                    },
                                  })
                                }
                                  className="w-full text-xs"
                                  style={wizardSelectFieldStyle}
                               >
                                {programs.map((program) => (
                                  <option key={program.id} value={program.id}>
                                    {program.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label={`Modelo para ${entry.role}`}
                                value={currentModel}
                                onChange={(event) =>
                                  onDraftChange({
                                    roleModels: {
                                      ...(draft.roleModels || {}),
                                      [entry.role_key]: event.target.value,
                                    },
                                  })
                                }
                                  className="w-full text-xs"
                                  style={wizardSelectFieldStyle}
                               >
                                <option value="">Default del perfil</option>
                                {roleModels.map((model) => (
                                  <option key={model.id} value={model.id}>
                                    {model.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <label className="space-y-2 text-sm font-medium md:col-span-2">
                    <span>Path operativo</span>
                    <input
                      aria-label="Workspace path"
                      value={draft.workspacePath || ''}
                      onChange={(event) => onDraftChange({ workspacePath: event.target.value })}
                    className="w-full"
                    style={wizardFieldStyle}
                  />
                  </label>

                  <label className="space-y-2 text-sm font-medium md:col-span-2">
                    <span>Mission</span>
                    <textarea
                      aria-label="Launch mission"
                      value={draft.mission || ''}
                      onChange={(event) => onDraftChange({ mission: event.target.value })}
                      rows={5}
                    className="w-full"
                    style={wizardFieldStyle}
                  />
                  </label>
                </div>
              </div>
            ) : null}

            {currentStep === 'launch' ? (
              <div className="space-y-5">
                <SurfaceCard emphasized className="p-5">
                  <div className="flex flex-wrap gap-2">
                    <SurfacePill tone="accent">Summary</SurfacePill>
                    <SurfacePill>{preview?.template?.label || 'Sin plantilla'}</SurfacePill>
                    <SurfacePill>{preview?.team?.label || 'Sin team'}</SurfacePill>
                    <SurfacePill>{preview?.provider?.label || 'Sin provider'}</SurfacePill>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {preview?.summaryLines?.map((line) => (
                        <div
                          key={line}
                          className="border px-3 py-3 text-sm"
                          style={wizardInsetPanelStyle()}
                        >
                        {line}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div
                      className="border px-3 py-3 text-sm"
                      style={wizardInsetPanelStyle()}
                    >
                      Strategy · {preview?.launchStrategyLabel || 'Director-first bootstrap'}
                    </div>
                    <div
                      className="border px-3 py-3 text-sm"
                      style={wizardInsetPanelStyle()}
                    >
                      Bootstrap · {preview?.bootstrapModeLabel || 'Engram first'}
                    </div>
                  </div>
                </SurfaceCard>

                <div className="grid gap-4 md:grid-cols-2">
                  <SurfaceCard className="p-5">
                    <p className="text-sm font-semibold">Roster previsto</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(preview?.topology?.roles || []).map((role) => (
                        <SurfacePill key={role}>{role}</SurfacePill>
                      ))}
                    </div>
                  </SurfaceCard>

                  <SurfaceCard className="p-5">
                    <p className="text-sm font-semibold">Programas por rol</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(preview?.rolePrograms || []).map((entry) => (
                        <SurfacePill key={entry.role_key}>
                          {entry.role} · {entry.program_label}
                        </SurfacePill>
                      ))}
                    </div>
                  </SurfaceCard>

                  <SurfaceCard className="p-5">
                    <p className="text-sm font-semibold">Payload local</p>
                    <pre
                      className="mt-3 overflow-x-auto text-xs"
                      style={{ ...codeBlockStyle(), color: 'var(--text-muted)' }}
                    >
                      {JSON.stringify(draft, null, 2)}
                    </pre>
                  </SurfaceCard>
                </div>
              </div>
            ) : null}
          </main>

          <aside
            className="border-l p-5"
            style={wizardRightRailStyle}
          >
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold">Topology preview</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Reutilizable para launch y handoff inicial.
                </p>
              </div>

              <TopologyPreview topology={preview?.topology} />

              <SurfaceCard className="p-4">
                <p className="text-sm font-semibold">Snapshot-first summary</p>
                <div className="mt-3 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <div>Modo · {preview?.modeLabel || 'Template team'}</div>
                  <div>Category · {preview?.category?.label || 'Sin categoría'}</div>
                  <div>Strategy · {preview?.launchStrategyLabel || 'Director-first bootstrap'}</div>
                  <div>Bootstrap · {preview?.bootstrapModeLabel || 'Engram first'}</div>
                  <div>Path · {draft.workspacePath || 'Sin path'}</div>
                </div>
              </SurfaceCard>

              <div className="flex flex-col gap-3">
                {currentStep !== 'team' ? (
                  <button
                    type="button"
                    onClick={() =>
                      onStepChange(STEP_ORDER[Math.max(0, STEP_ORDER.indexOf(currentStep) - 1)])
                    }
                    className="text-sm font-medium"
                    style={{
                      ...btnSecondaryStyle({ size: 'md' }),
                      width: '100%',
                      textTransform: 'none',
                      letterSpacing: 'normal',
                    }}
                  >
                    Volver
                  </button>
                ) : null}

                {currentStep !== 'launch' ? (
                  <button
                    type="button"
                    onClick={() =>
                      onStepChange(
                        STEP_ORDER[
                          Math.min(STEP_ORDER.length - 1, STEP_ORDER.indexOf(currentStep) + 1)
                        ]
                      )
                    }
                    className="text-sm font-medium"
                    style={{
                      ...btnPrimaryStyle({ size: 'md' }),
                      width: '100%',
                      textTransform: 'none',
                      letterSpacing: 'normal',
                    }}
                  >
                    Siguiente
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onSubmitStateChange?.({ submitting: false, error: null });
                        onLaunch?.();
                      }}
                      disabled={!preview?.isReady || submitState?.submitting}
                      className="text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        ...btnPrimaryStyle({ size: 'md' }),
                        width: '100%',
                        textTransform: 'none',
                        letterSpacing: 'normal',
                      }}
                    >
                      {submitState?.submitting
                        ? 'Lanzando…'
                        : preview?.isReady
                          ? 'Lanzar swarm local'
                          : 'Completá configuración'}
                    </button>

                    {submitState?.error ? (
                      <div
                        className="border px-3 py-2 text-sm font-medium"
                        style={dangerBannerStyle()}
                      >
                        <div>{submitState.error}</div>
                        {submitState.error.includes('swarm activo') && (
                          <button
                            type="button"
                            className="mt-2 text-xs font-semibold"
                            style={{
                              ...btnDangerStyle({ size: 'xs' }),
                              textTransform: 'none',
                              letterSpacing: 'normal',
                              color: 'var(--danger)',
                              background:
                                'color-mix(in srgb, var(--danger) 12%, transparent)',
                              borderColor:
                                'color-mix(in srgb, var(--danger) 42%, var(--chrome-border-color))',
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
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modal, document.body);
  }

  return modal;
}
