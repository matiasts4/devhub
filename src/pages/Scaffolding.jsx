'use client';
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Cpu, Layers, Loader2, RefreshCw, Rocket, Server, Wrench } from "lucide-react";
import { toast } from "sonner";

const START_MARKER = "__DEVHUB_SCAFFOLD_START__";
const END_MARKER = "__DEVHUB_SCAFFOLD_DONE__";

const templates = [
  {
    id: "next-api-health",
    nombre: "API Health Check",
    descripcion: "Crea una ruta API de health y un cliente utilitario para monitoreo local.",
    icon: Server,
    color: "#58A6FF",
    popular: true,
    tags: ["Next.js", "API", "Observabilidad"],
    files: [
      {
        path: "src/app/api/health/route.js",
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
        path: "src/lib/health/checkHealth.js",
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
    id: "react-feature-slice",
    nombre: "Feature Slice UI",
    descripcion: "Genera una mini feature de UI reutilizable con componente y hook local.",
    icon: Rocket,
    color: "#3FB950",
    popular: true,
    tags: ["React", "Feature", "Boilerplate"],
    files: [
      {
        path: "src/components/features/QuickActionCard.jsx",
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
        path: "src/hooks/useQuickActions.js",
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
    id: "qa-smoke-tests",
    nombre: "QA Smoke Files",
    descripcion: "Añade una base de pruebas smoke y una checklist de QA para nuevos modulos.",
    icon: Wrench,
    color: "#E3B341",
    popular: false,
    tags: ["QA", "Testing", "Checklist"],
    files: [
      {
        path: "tests/smoke/scaffolding_smoke.test.js",
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
        path: "test_reports/scaffolding_checklist.md",
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

const urgenciaColor = { Alta: "#FFA657", Media: "#E3B341", Baja: "#3FB950" };

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

  if (pathSet.has('next.config.js')) stack.push({ id: 'next', label: 'Next.js 15', color: '#58A6FF' });
  if (pathSet.has('package.json')) stack.push({ id: 'node', label: 'Node.js Workspace', color: '#3FB950' });
  if (pathSet.has('tailwind.config.js')) stack.push({ id: 'tailwind', label: 'Tailwind CSS', color: '#39C5CF' });
  if (pathSet.has('src-tauri/Cargo.toml')) stack.push({ id: 'tauri', label: 'Tauri (Rust)', color: '#E3B341' });
  if (pathSet.has('public/manifest.json')) stack.push({ id: 'pwa', label: 'PWA Base', color: '#D2A8FF' });
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
      motivo: 'En apps de escritorio híbridas, una checklist de smoke reduce regresiones de empaquetado.',
    });
  }

  suggestions.push({
    id: 's3',
    paquete: 'Plantilla recomendada: Feature Slice UI',
    urgencia: suggestions.length === 0 ? 'Alta' : 'Baja',
    motivo: 'Acelera la creación de módulos UI reutilizables y mantiene una estructura consistente.',
  });

  return suggestions;
}

function buildScript({ rootPath, files }) {
  const lines = [
    'set -e',
    `cd '${shellSingleQuote(rootPath)}'`,
    `printf '${START_MARKER}\\n'`,
  ];

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

  const generarPlantilla = useCallback(async (template) => {
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
  }, [loadTree, rootPath]);

  return (
    <div className="min-h-screen bg-surface-app">
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-[#D2A8FF]" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-text-primary">Scaffolding & Stack</h1>
        </div>
        <button
          type="button"
          data-testid="generar-stack-btn"
          onClick={loadTree}
          className="flex items-center gap-2 bg-surface-elevated border border-borders-strong text-text-muted font-medium px-3 py-1.5 rounded-lg text-xs hover:text-text-primary hover:border-borders-strong transition-all"
        >
          {loadingTree ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />}
          {loadingTree ? 'Analizando stack...' : 'Re-analizar proyecto'}
        </button>
      </div>

      <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Templates */}
        <div className="lg:col-span-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-3">Plantillas de Stack</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {loadingTree && (
              <div className="col-span-1 border border-dashed border-borders-strong rounded-xl p-6 flex items-center justify-center text-text-muted text-xs">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando arbol de archivos...
              </div>
            )}
            {!loadingTree && treeError && (
              <div className="col-span-1 sm:col-span-2 border border-[#F778BA33] bg-[#F778BA11] rounded-xl p-5 text-danger text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{treeError}</span>
              </div>
            )}
            {templates.map((t, i) => {
              const Icon = t.icon;
              const isSelected = selectedTemplate === t.id;
              const isGenerating = generatingTemplateId === t.id;

              return (
                <div
                  key={t.id}
                  data-testid={`template-${t.id}`}
                  className={`fade-in-up bg-surface-card border rounded-xl p-4 transition-all ${
                    isSelected ? 'border-[#58A6FF]' : 'border-borders-subtle hover:bg-surface-elevated hover:border-borders-strong'
                  }`}
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: t.color }} />
                    {t.popular && <span className="text-[9px] text-accent-primary bg-[#388BFD]/12 px-1.5 py-0.5 rounded-full border border-[#388BFD]/20">Popular</span>}
                  </div>
                  <h3 className="font-mono font-semibold text-sm text-text-primary mb-1">{t.nombre}</h3>
                  <p className="text-[11px] text-text-muted mb-3">{t.descripcion}</p>
                  <div className="flex flex-wrap gap-1">
                    {t.tags.map((tag) => (
                      <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 bg-surface-elevated text-text-muted rounded border border-borders-strong">{tag}</span>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-borders-subtle flex items-center justify-between gap-2">
                    <span className="text-[10px] text-text-muted">{t.files.length} archivo(s) boilerplate</span>
                    <button
                      type="button"
                      disabled={Boolean(generatingTemplateId) || Boolean(treeError) || loadingTree}
                      onClick={() => generarPlantilla(t)}
                      className="text-[10px] bg-[#1F6FEB] text-white px-2.5 py-1 rounded-md hover:bg-[#388BFD] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium inline-flex items-center gap-1.5"
                    >
                      {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" strokeWidth={1.5} />}
                      {isGenerating ? 'Generando...' : 'Generar boilerplate'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sugerencias IA */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-3">Stack Detectado</p>
          <div className="space-y-3">
            <div className="bg-surface-card border border-borders-subtle rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Check className="w-3.5 h-3.5 text-success" strokeWidth={1.5} />
                <p className="text-[11px] font-semibold text-text-primary">Tecnologias encontradas</p>
              </div>
              {stack.length === 0 ? (
                <p className="text-xs text-text-muted">Aun no hay datos del stack. Ejecuta "Re-analizar proyecto".</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {stack.map((item) => (
                    <span
                      key={item.id}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                      style={{ color: item.color, borderColor: `${item.color}55`, backgroundColor: `${item.color}18` }}
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
              )}
              {rootPath && (
                <p className="mt-3 text-[10px] text-text-muted break-all">Root: {rootPath}</p>
              )}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-2">Sugerencias IA</p>
              <div className="space-y-2">
                {sugerenciasIA.map((s) => (
                  <div key={s.id} data-testid={`sugerencia-${s.id}`} className="bg-surface-card border border-borders-subtle rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-mono" style={{ color: urgenciaColor[s.urgencia] }}>{s.paquete}</span>
                      <span className="text-[9px] font-medium" style={{ color: urgenciaColor[s.urgencia] }}>{s.urgencia}</span>
                    </div>
                    <p className="text-[10px] text-text-muted">{s.motivo}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold mb-2">Ultima Generacion</p>
              <div className="bg-surface-card border border-borders-subtle rounded-xl p-4 space-y-2 text-[10px]">
                {generationReport.created.length === 0 && generationReport.skipped.length === 0 ? (
                  <p className="text-text-muted">Aun no se generaron archivos.</p>
                ) : (
                  <>
                    <div>
                      <p className="text-success font-semibold mb-1">CREATED ({generationReport.created.length})</p>
                      {generationReport.created.length === 0 ? (
                        <p className="text-text-muted">Sin archivos nuevos.</p>
                      ) : (
                        generationReport.created.map((filePath) => (
                          <p key={`created-${filePath}`} className="font-mono text-[#B1BAC4] break-all">{filePath}</p>
                        ))
                      )}
                    </div>
                    <div>
                      <p className="text-[#E3B341] font-semibold mb-1">SKIP ({generationReport.skipped.length})</p>
                      {generationReport.skipped.length === 0 ? (
                        <p className="text-text-muted">No hubo saltos por existencia previa.</p>
                      ) : (
                        generationReport.skipped.map((filePath) => (
                          <p key={`skip-${filePath}`} className="font-mono text-[#B1BAC4] break-all">{filePath}</p>
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
