import React from 'react';
import { SurfaceCard, SurfacePill } from './SwarmSurfaceCard';

export default function LaunchpadTemplatesPanel({
  catalog,
  selectedTemplateId = null,
  onSelectTemplate,
  onLaunch,
}) {
  const templates = Array.isArray(catalog?.templates) ? catalog.templates : [];
  const recommendedId = catalog?.recommended_template_id;

  return (
    <section aria-label="Plantillas de launchpad" id="launchpad-templates" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Plantillas de launchpad</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Elegí una plantilla lista para operar sin abrir configuración profunda.
          </p>
        </div>
        <SurfacePill tone="accent">Plantilla recomendada</SurfacePill>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {templates.map((template) => {
          const recommended = template.id === recommendedId;
          const selected = template.id === selectedTemplateId;

          return (
            <SurfaceCard
              key={template.id}
              emphasized={recommended || selected}
              className="h-full p-4 transition-transform hover:-translate-y-0.5"
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectTemplate?.(template.id)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{template.label}</h3>
                    <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {template.summary}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {recommended ? <SurfacePill tone="accent">Recomendada</SurfacePill> : null}
                    {selected ? <SurfacePill tone="accent">Seleccionada</SurfacePill> : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <SurfacePill>{template.readiness}</SurfacePill>
                  {(template.tags || []).map((tag) => (
                    <SurfacePill key={tag}>{tag}</SurfacePill>
                  ))}
                </div>

                {template.topology?.label ? (
                  <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Topología · {template.topology.label}
                  </p>
                ) : null}
              </button>

              <div
                className="mt-4 flex items-center justify-between gap-3 border-t pt-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {selected ? 'Lista para abrir wizard' : 'Usar como base del launch'}
                </span>
                <button
                  type="button"
                  onClick={() => onLaunch?.(template.id)}
                  className="rounded-full border px-3 py-1 text-xs font-medium"
                  style={{
                    borderColor: 'rgba(255,176,64,0.24)',
                    background: 'rgba(255,176,64,0.12)',
                  }}
                >
                  Abrir wizard
                </button>
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </section>
  );
}
