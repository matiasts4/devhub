import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SurfaceCard, SurfacePill } from './SwarmSurfaceCard';

const STEP_ORDER = ['team', 'configure', 'launch'];

function TopologyPreview({ topology }) {
  if (!topology) {
    return (
      <div
        className="rounded-2xl border p-4 text-sm"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        Sin topología reusable definida todavía.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(255,176,64,0.18)' }}>
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
      className="flex items-center gap-3 rounded-2xl border px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: active ? 'rgba(255,176,64,0.28)' : 'var(--border-subtle)',
        background: active ? 'rgba(255,176,64,0.1)' : 'transparent',
      }}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold"
        style={{
          borderColor: active ? 'rgba(255,176,64,0.28)' : 'var(--border-subtle)',
          background: active ? 'rgba(255,176,64,0.18)' : 'rgba(255,255,255,0.02)',
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

  const stepDescription = useMemo(() => {
    if (currentStep === 'team') return 'Elegí base operativa: template team o custom team.';
    if (currentStep === 'configure') return 'Ajustá defaults snapshot-first antes de lanzar.';
    return 'Revisá summary, topología y payload local del launch.';
  }, [currentStep]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Launch wizard de swarm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border"
        style={{
          background: 'linear-gradient(180deg, rgba(32,25,20,0.98) 0%, rgba(18,18,18,0.98) 100%)',
          borderColor: 'rgba(255,176,64,0.18)',
          color: 'var(--text-primary)',
        }}
      >
        <div
          className="flex items-start justify-between gap-4 border-b px-6 py-5"
          style={{ borderColor: 'rgba(255,176,64,0.14)' }}
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
            className="rounded-full border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            Cerrar
          </button>
        </div>

        <div className="grid flex-1 gap-0 overflow-hidden xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className="border-r p-4" style={{ borderColor: 'rgba(255,176,64,0.12)' }}>
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
              className="mt-6 rounded-2xl border p-4 text-sm"
              style={{ borderColor: 'var(--border-subtle)' }}
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
                      className="w-full rounded-2xl border px-3 py-3"
                      style={{
                        background: 'var(--surface-app)',
                        borderColor: 'var(--border-subtle)',
                      }}
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
                      className="w-full rounded-2xl border px-3 py-3"
                      style={{
                        background: 'var(--surface-app)',
                        borderColor: 'var(--border-subtle)',
                      }}
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
                      className="w-full rounded-2xl border px-3 py-3"
                      style={{
                        background: 'var(--surface-app)',
                        borderColor: 'var(--border-subtle)',
                      }}
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
                      className="w-full rounded-2xl border px-3 py-3"
                      style={{
                        background: 'var(--surface-app)',
                        borderColor: 'var(--border-subtle)',
                      }}
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
                      className="w-full rounded-2xl border px-3 py-3"
                      style={{
                        background: 'var(--surface-app)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="space-y-3 md:col-span-2">
                    <div>
                      <p className="text-sm font-medium">Programa por rol</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        Elegí qué cliente usa cada rol del swarm antes del launch.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {(preview?.rolePrograms || []).map((entry) => (
                        <label key={entry.role_key} className="space-y-2 text-sm font-medium">
                          <span>{entry.role}</span>
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
                            className="w-full rounded-2xl border px-3 py-3"
                            style={{
                              background: 'var(--surface-app)',
                              borderColor: 'var(--border-subtle)',
                            }}
                          >
                            {programs.map((program) => (
                              <option key={program.id} value={program.id}>
                                {program.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="space-y-2 text-sm font-medium md:col-span-2">
                    <span>Path operativo</span>
                    <input
                      aria-label="Workspace path"
                      value={draft.workspacePath || ''}
                      onChange={(event) => onDraftChange({ workspacePath: event.target.value })}
                      className="w-full rounded-2xl border px-3 py-3"
                      style={{
                        background: 'var(--surface-app)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    />
                  </label>

                  <label className="space-y-2 text-sm font-medium md:col-span-2">
                    <span>Mission</span>
                    <textarea
                      aria-label="Launch mission"
                      value={draft.mission || ''}
                      onChange={(event) => onDraftChange({ mission: event.target.value })}
                      rows={5}
                      className="w-full rounded-2xl border px-3 py-3"
                      style={{
                        background: 'var(--surface-app)',
                        borderColor: 'var(--border-subtle)',
                      }}
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
                        className="rounded-2xl border px-3 py-3 text-sm"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {line}
                      </div>
                    ))}
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
                      className="mt-3 overflow-x-auto rounded-2xl border p-3 text-xs"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                    >
                      {JSON.stringify(draft, null, 2)}
                    </pre>
                  </SurfaceCard>
                </div>
              </div>
            ) : null}
          </main>

          <aside className="border-l p-5" style={{ borderColor: 'rgba(255,176,64,0.12)' }}>
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
                    className="rounded-2xl border px-4 py-3 text-sm font-medium"
                    style={{ borderColor: 'var(--border-subtle)' }}
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
                    className="rounded-2xl border px-4 py-3 text-sm font-medium"
                    style={{
                      borderColor: 'rgba(255,176,64,0.24)',
                      background: 'rgba(255,176,64,0.12)',
                    }}
                  >
                    Siguiente
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onLaunch?.()}
                    disabled={!preview?.isReady}
                    className="rounded-2xl border px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      borderColor: 'rgba(255,176,64,0.26)',
                      background: 'rgba(255,176,64,0.18)',
                    }}
                  >
                    {preview?.isReady ? 'Lanzar swarm local' : 'Completá configuración'}
                  </button>
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
