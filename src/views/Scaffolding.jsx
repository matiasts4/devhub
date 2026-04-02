'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Cpu,
  Layers,
  Loader2,
  RefreshCw,
  Rocket,
  Server,
  Wrench,
  Hash,
} from 'lucide-react';
import { toast } from 'sonner';

const START_MARKER = '__DEVHUB_SCAFFOLD_START__';
const END_MARKER = '__DEVHUB_SCAFFOLD_DONE__';

const templates = [
  {
    id: 'next-api-health',
    nombre: 'API Health Check',
    descripcion: 'Crea una ruta API de health y un cliente utilitario para monitoreo local.',
    icon: Server,
    color: '#58A6FF',
    popular: true,
    tags: ['Next.js', 'API', 'Observabilidad'],
    files: [
      {
        path: 'src/app/api/health/route.js',
        content: `import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'devhub',
    timestamp: new Date().toISOString(),
  });
}
`,
      },
      {
        path: 'src/lib/health/checkHealth.js',
        content: `export async function checkHealth() {
  const response = await fetch('/api/health', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('No se pudo consultar /api/health');
  }

  return response.json();
}
`,
      },
    ],
  },
  {
    id: 'react-feature-slice',
    nombre: 'Feature Slice UI',
    descripcion: 'Genera una mini feature de UI reutilizable con componente y hook local.',
    icon: Rocket,
    color: '#3FB950',
    popular: true,
    tags: ['React', 'Feature', 'Boilerplate'],
    files: [
      {
        path: 'src/components/features/QuickActionCard.jsx',
        content: `export default function QuickActionCard({ title, description, onRun }) {
  return (
    <article className="rounded-lg border border-borders-strong bg-surface-card p-4">
      <h3 className="font-mono text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-xs text-text-muted">{description}</p>
      <button
        type="button"
        onClick={onRun}
        className="mt-3 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-success"
      >
        Ejecutar
      </button>
    </article>
  );
}
`,
      },
      {
        path: 'src/hooks/useQuickActions.js',
        content: `import { useMemo } from 'react';

export function useQuickActions() {
  return useMemo(
    () => [
      {
        id: 'health',
        title: 'Probar Health API',
        description: 'Ejecuta la verificacion basica del backend local.',
      },
    ],
    []
  );
}
`,
      },
    ],
  },
  {
    id: 'qa-smoke-tests',
    nombre: 'QA Smoke Files',
    descripcion: 'Añade una base de pruebas smoke y una checklist de QA para nuevos modulos.',
    icon: Wrench,
    color: '#E3B341',
    popular: false,
    tags: ['QA', 'Testing', 'Checklist'],
    files: [
      {
        path: 'tests/smoke/scaffolding_smoke.test.js',
        content: `describe('Scaffolding smoke', () => {
  test('template generation metadata exists', () => {
    const metadata = {
      generatedBy: 'Smart-Scaffold',
      version: '1.0.0',
    };

    expect(metadata.generatedBy).toBe('Smart-Scaffold');
  });
});
`,
      },
      {
        path: 'test_reports/scaffolding_checklist.md',
        content: `# Scaffolding Checklist

- [ ] El endpoint /api/fs/tree responde 200.
- [ ] Se detecta stack del proyecto.
- [ ] La plantilla crea archivos nuevos.
- [ ] No se sobrescriben archivos existentes.
- [ ] El resultado muestra CREATED/SKIP por archivo.
`,
      },
    ],
  },
];

const urgenciaColor = { Alta: '#FFA657', Media: '#E3B341', Baja: '#3FB950' };

function shellSingleQuote(value) {
  return value.replace(/'/g, `"'"'`);
}

function collectPaths(nodes = [], bucket = new Set()) {
  for (const node of nodes) {
    if (node?.path) bucket.add(node.path);
    if (Array.isArray(node?.children)) {
      collectPaths(node.children, bucket);
    }
  }
  return bucket;
}

function dirnameFromPath(filePath) {
  const parts = filePath.split('/');
  parts.pop();
  return parts.join('/');
}

function inferStack(pathSet) {
  const stack = [];

  if (pathSet.has('next.config.js'))
    stack.push({ id: 'next', label: 'Next.js 15', color: '#58A6FF' });
  if (pathSet.has('package.json'))
    stack.push({ id: 'node', label: 'Node.js Workspace', color: '#3FB950' });
  if (pathSet.has('tailwind.config.js'))
    stack.push({ id: 'tailwind', label: 'Tailwind CSS', color: '#39C5CF' });
  if (pathSet.has('src-tauri/Cargo.toml'))
    stack.push({ id: 'tauri', label: 'Tauri (Rust)', color: '#E3B341' });
  if (pathSet.has('public/manifest.json'))
    stack.push({ id: 'pwa', label: 'PWA Base', color: '#D2A8FF' });
  if (pathSet.has('src/lib/supabase/client.js') || pathSet.has('src/lib/supabase/server.js')) {
    stack.push({ id: 'supabase', label: 'Supabase', color: '#3FB950' });
  }

  return stack;
}

function buildSuggestions(stack) {
  const stackIds = new Set(stack.map((item) => item.id));
  const suggestions = [];

  if (stackIds.has('next')) {
    suggestions.push({
      id: 's1',
      paquete: 'Plantilla recomendada: API Health Check',
      urgencia: 'Alta',
      motivo: 'Tu stack usa Next.js; conviene crear endpoints base para checks operativos.',
    });
  }

  if (stackIds.has('tauri')) {
    suggestions.push({
      id: 's2',
      paquete: 'Plantilla recomendada: QA Smoke Files',
      urgencia: 'Media',
      motivo:
        'En apps de escritorio híbridas, una checklist de smoke reduce regresiones de empaquetado.',
    });
  }

  suggestions.push({
    id: 's3',
    paquete: 'Plantilla recomendada: Feature Slice UI',
    urgencia: suggestions.length === 0 ? 'Alta' : 'Baja',
    motivo:
      'Acelera la creación de módulos UI reutilizables y mantiene una estructura consistente.',
  });

  return suggestions;
}

function buildScript({ rootPath, files }) {
  const lines = ['set -e', `cd '${shellSingleQuote(rootPath)}'`, `printf '${START_MARKER}\\n'`];

  files.forEach((file, index) => {
    const safePath = shellSingleQuote(file.path);
    const dir = dirnameFromPath(file.path);
    const heredocMarker = `DEVHUB_SCAFFOLD_EOF_${index}`;

    if (dir) {
      lines.push(`mkdir -p '${shellSingleQuote(dir)}'`);
    }

    lines.push(`if [ -e '${safePath}' ]; then`);
    lines.push(`  printf 'SKIP::%s\\n' '${safePath}'`);
    lines.push('else');
    lines.push(`  cat <<'${heredocMarker}' > '${safePath}'`);
    lines.push(file.content);
    lines.push(heredocMarker);
    lines.push(`  printf 'CREATED::%s\\n' '${safePath}'`);
    lines.push('fi');
  });

  lines.push(`printf '${END_MARKER}\\n'`);
  lines.push('exit');
  return `${lines.join('\n')}\n`;
}

async function runScriptViaTTY(script) {
  const sessionResponse = await fetch('/api/terminal/session', { cache: 'no-store' });
  if (!sessionResponse.ok) {
    throw new Error('No se pudo abrir la sesion PTY para generar archivos.');
  }

  const { port, wsPath } = await sessionResponse.json();
  if (!port || !wsPath) {
    throw new Error('La sesion PTY no devolvio datos validos.');
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${wsProtocol}://127.0.0.1:${port}${wsPath}`;

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let outputBuffer = '';
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      socket.close();
      reject(new Error('Timeout: no se completo la generacion de scaffolding.'));
    }, 30000);

    const finish = (callback) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      socket.close();
      callback();
    };

    socket.addEventListener('message', (event) => {
      let payload;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (payload.type === 'ready') {
        socket.send(JSON.stringify({ type: 'input', data: script }));
        return;
      }

      if (payload.type === 'output') {
        outputBuffer += String(payload.data || '');
        if (outputBuffer.includes(END_MARKER)) {
          finish(() => resolve(outputBuffer));
        }
        return;
      }

      if (payload.type === 'exit' && !outputBuffer.includes(END_MARKER)) {
        finish(() => reject(new Error('La terminal cerro antes de completar el scaffolding.')));
      }
    });

    socket.addEventListener('error', () => {
      finish(() => reject(new Error('Fallo la conexion websocket con PTY.')));
    });
  });
}

function parseGenerationReport(rawOutput) {
  const created = [];
  const skipped = [];

  const pattern = /^(CREATED|SKIP)::(.+)$/gm;
  let match = pattern.exec(rawOutput);
  while (match) {
    if (match[1] === 'CREATED') {
      created.push(match[2].trim());
    } else {
      skipped.push(match[2].trim());
    }
    match = pattern.exec(rawOutput);
  }

  return { created, skipped };
}

/* ── Reusable card header component ──────────────────────────────────── */

function CardHeader({ icon: Icon, iconColor, title, subtitle, action }) {
  return (
    <div
      className="flex items-center justify-between px-6 py-4"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}30` }}
        >
          <Icon className="w-4 h-4" style={{ color: iconColor }} />
        </div>
        <div>
          <h3 className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */

export default function Scaffolding() {
  const [rootPath, setRootPath] = useState('');
  const [tree, setTree] = useState([]);
  const [loadingTree, setLoadingTree] = useState(true);
  const [treeError, setTreeError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [generatingTemplateId, setGeneratingTemplateId] = useState('');
  const [generationReport, setGenerationReport] = useState({ created: [], skipped: [] });

  const pathSet = useMemo(() => collectPaths(tree), [tree]);
  const stack = useMemo(() => inferStack(pathSet), [pathSet]);
  const sugerenciasIA = useMemo(() => buildSuggestions(stack), [stack]);

  const loadTree = useCallback(async () => {
    setLoadingTree(true);
    setTreeError('');
    try {
      const response = await fetch('/api/fs/tree', { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'No se pudo cargar el arbol del proyecto.');
      }

      setRootPath(typeof data.root === 'string' ? data.root : '');
      setTree(Array.isArray(data.tree) ? data.tree : []);
    } catch (error) {
      setTreeError(error.message || 'No se pudo cargar el arbol del proyecto.');
    } finally {
      setLoadingTree(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const generarPlantilla = useCallback(
    async (template) => {
      if (!rootPath) {
        toast.error('No hay raiz de proyecto disponible para generar archivos.');
        return;
      }

      setGeneratingTemplateId(template.id);
      setSelectedTemplate(template.id);

      try {
        const script = buildScript({ rootPath, files: template.files });
        const output = await runScriptViaTTY(script);
        const report = parseGenerationReport(output);

        setGenerationReport(report);
        await loadTree();

        const createdCount = report.created.length;
        const skippedCount = report.skipped.length;

        if (createdCount > 0) {
          toast.success(`Plantilla aplicada: ${createdCount} archivo(s) creado(s).`);
        } else {
          toast.info(`Sin cambios nuevos. ${skippedCount} archivo(s) ya existian.`);
        }
      } catch (error) {
        toast.error(error.message || 'No se pudo generar la plantilla.');
      } finally {
        setGeneratingTemplateId('');
      }
    },
    [loadTree, rootPath]
  );

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
    >
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 backdrop-blur-sm border-b px-6 py-3 flex items-center justify-between"
        style={{
          background: 'color-mix(in srgb, var(--surface-app) 90%, transparent)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-3">
          <Layers
            className="w-4 h-4"
            strokeWidth={1.5}
            style={{ color: 'var(--accent-primary)' }}
          />
          <h1 className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Scaffolding & Stack
          </h1>
        </div>
        <button
          type="button"
          data-testid="generar-stack-btn"
          onClick={loadTree}
          className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:text-[var(--text-primary)] cursor-pointer"
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)',
          }}
        >
          {loadingTree ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
          {loadingTree ? 'Analizando stack...' : 'Re-analizar proyecto'}
        </button>
      </div>

      <div className="px-6 py-6 w-full max-w-[1200px] mx-auto">
        {/* Breadcrumb */}
        <div
          className="rounded-xl border px-4 py-2.5 flex items-center gap-2 mb-6"
          style={{ background: 'var(--surface-card)', borderColor: 'var(--border-subtle)' }}
        >
          <Hash className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            DevHub
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ›
          </span>
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Scaffolding
          </span>
        </div>

        <div className="fade-in-up grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Templates card */}
          <div className="lg:col-span-2">
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <CardHeader
                icon={Layers}
                iconColor="#D2A8FF"
                title="Plantillas de Stack"
                subtitle="Genera boilerplate estructurado para tu proyecto"
              />

              <div className="p-6">
                {loadingTree && (
                  <div
                    className="border border-dashed rounded-xl p-6 flex items-center justify-center text-xs"
                    style={{
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando arbol de archivos...
                  </div>
                )}
                {!loadingTree && treeError && (
                  <div
                    className="rounded-xl p-5 text-xs flex items-start gap-2"
                    style={{
                      background: '#F778BA11',
                      border: '1px solid #F778BA33',
                      color: 'var(--danger)',
                    }}
                  >
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{treeError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {templates.map((t, i) => {
                    const Icon = t.icon;
                    const isSelected = selectedTemplate === t.id;
                    const isGenerating = generatingTemplateId === t.id;

                    return (
                      <div
                        key={t.id}
                        data-testid={`template-${t.id}`}
                        className="rounded-xl border p-4 transition-all hover:border-[var(--border-strong)] hover:bg-surface-elevated"
                        style={{
                          borderColor: isSelected
                            ? 'var(--accent-primary)'
                            : 'var(--border-subtle)',
                          background: isSelected
                            ? 'color-mix(in srgb, var(--surface-elevated) 92%, transparent)'
                            : 'var(--surface-card)',
                          animationDelay: `${i * 50}ms`,
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: t.color }} />
                          {t.popular && (
                            <span
                              className="text-[11px] px-1.5 py-0.5 rounded-full border"
                              style={{
                                color: 'var(--accent-primary)',
                                background:
                                  'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
                                borderColor:
                                  'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                              }}
                            >
                              Popular
                            </span>
                          )}
                        </div>
                        <h3
                          className="font-mono font-semibold text-sm mb-1"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {t.nombre}
                        </h3>
                        <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                          {t.descripcion}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {t.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[11px] font-mono px-1.5 py-0.5 rounded border"
                              style={{
                                background: 'var(--surface-elevated)',
                                color: 'var(--text-muted)',
                                borderColor: 'var(--border-strong)',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div
                          className="mt-4 pt-3 flex items-center justify-between gap-2"
                          style={{ borderTop: '1px solid var(--border-subtle)' }}
                        >
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {t.files.length} archivo(s) boilerplate
                          </span>
                          <button
                            type="button"
                            disabled={
                              Boolean(generatingTemplateId) || Boolean(treeError) || loadingTree
                            }
                            onClick={() => generarPlantilla(t)}
                            className="text-xs font-medium px-2.5 py-1 rounded-md transition-colors hover:bg-[#388BFD] inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            style={{
                              background: '#1F6FEB',
                              color: 'white',
                            }}
                          >
                            {isGenerating ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Cpu className="w-3 h-3" strokeWidth={1.5} />
                            )}
                            {isGenerating ? 'Generando...' : 'Generar boilerplate'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Stack Detectado */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <CardHeader
                icon={Check}
                iconColor="#3FB950"
                title="Stack Detectado"
                subtitle="Tecnologias encontradas en tu proyecto"
              />

              <div className="p-6">
                {stack.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Aun no hay datos del stack. Ejecuta "Re-analizar proyecto".
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {stack.map((item) => (
                      <span
                        key={item.id}
                        className="text-xs font-mono px-2 py-0.5 rounded-full border"
                        style={{
                          color: item.color,
                          borderColor: `${item.color}55`,
                          backgroundColor: `${item.color}18`,
                        }}
                      >
                        {item.label}
                      </span>
                    ))}
                  </div>
                )}
                {rootPath && (
                  <p className="mt-3 text-xs break-all" style={{ color: 'var(--text-muted)' }}>
                    Root: {rootPath}
                  </p>
                )}
              </div>
            </div>

            {/* Sugerencias IA */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <CardHeader
                icon={Rocket}
                iconColor="#58A6FF"
                title="Sugerencias IA"
                subtitle="Recomendaciones basadas en tu stack"
              />

              <div className="p-6 space-y-3">
                {sugerenciasIA.map((s) => (
                  <div
                    key={s.id}
                    data-testid={`sugerencia-${s.id}`}
                    className="rounded-lg p-3.5"
                    style={{ background: 'var(--surface-muted)' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-[11px] font-mono"
                        style={{ color: urgenciaColor[s.urgencia] }}
                      >
                        {s.paquete}
                      </span>
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: urgenciaColor[s.urgencia] }}
                      >
                        {s.urgencia}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {s.motivo}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Ultima Generacion */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <CardHeader
                icon={Cpu}
                iconColor="#E3B341"
                title="Ultima Generacion"
                subtitle="Reporte de archivos generados"
              />

              <div className="p-6 space-y-3 text-xs">
                {generationReport.created.length === 0 && generationReport.skipped.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>Aun no se generaron archivos.</p>
                ) : (
                  <>
                    <div>
                      <p className="font-semibold mb-1" style={{ color: 'var(--success)' }}>
                        CREATED ({generationReport.created.length})
                      </p>
                      {generationReport.created.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)' }}>Sin archivos nuevos.</p>
                      ) : (
                        generationReport.created.map((filePath) => (
                          <p
                            key={`created-${filePath}`}
                            className="font-mono break-all"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {filePath}
                          </p>
                        ))
                      )}
                    </div>
                    <div>
                      <p className="font-semibold mb-1" style={{ color: '#E3B341' }}>
                        SKIP ({generationReport.skipped.length})
                      </p>
                      {generationReport.skipped.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)' }}>
                          No hubo saltos por existencia previa.
                        </p>
                      ) : (
                        generationReport.skipped.map((filePath) => (
                          <p
                            key={`skip-${filePath}`}
                            className="font-mono break-all"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {filePath}
                          </p>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
