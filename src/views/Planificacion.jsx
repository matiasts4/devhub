'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Brain,
  Upload,
  FileText,
  Trash2,
  Loader2,
  Copy,
  Check,
  Sparkles,
  Milestone,
  ListTodo,
  Play,
  Save,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import { toast } from 'sonner';
import WorkspacePageTitle from '@/components/workspace/WorkspacePageTitle';
import { Button } from '@/components/ui/button';
import {
  DOCUMENTATION_POLICY_OPTIONS,
  DEFAULT_DOCUMENTATION_POLICY,
  DEFAULT_PROJECT_TYPE,
  PROJECT_TYPE_OPTIONS,
  buildProjectUpdatePayload,
} from '@/lib/projectClassification';
import {
  getWorkspacePageContentStyle,
  getWorkspacePageHeaderStyle,
  getWorkspacePageShellStyle,
  getWorkspaceSectionHeaderStripStyle,
  getWorkspaceSectionSurfaceStyle,
  getWorkspaceStatusPillStyle,
} from './workspacePageChrome';
import { btnPrimaryStyle, btnSecondaryStyle, inputStyle, pillStyle } from '@/chrome/morphology';
import {
  PLANNING_MODES,
  buildPlanningCopyPrompt,
  resolveDefaultPlanningMode,
} from '@/lib/planning/planningPrompts';
import { launchPlanningAgent } from '@/lib/planning/launchPlanningAgent';
import { validatePlanningLaunch } from '@/lib/planning/validatePlanningLaunch';

const ACCEPTED_TYPES = [
  '.txt',
  '.md',
  '.json',
  '.yaml',
  '.yml',
  '.csv',
  '.js',
  '.ts',
  '.py',
  '.jsx',
  '.tsx',
];

const fieldStyle = inputStyle();

export default function Planificacion() {
  const { project } = useOutletContext() || {};
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const db = createClient();
  const dropRef = useRef(null);
  const modeTouchedRef = useRef(false);

  const [planningPrompt, setPlanningPrompt] = useState(project?.planning_prompt || '');
  const [projectType, setProjectType] = useState(project?.project_type || DEFAULT_PROJECT_TYPE);
  const [documentationPolicy, setDocumentationPolicy] = useState(
    project?.documentation_policy || DEFAULT_DOCUMENTATION_POLICY
  );
  const [mode, setMode] = useState('initial');
  const [files, setFiles] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  // Preflight banner state (Fase 3). When non-null, the inline error banner
  // is rendered above the launch button. The full `checks` array is stashed
  // for a future modal surface (per design Decision 2) — not rendered here.
  const [preflightError, setPreflightError] = useState(null);
  const [preflightChecks, setPreflightChecks] = useState([]);

  const fetchFiles = useCallback(async () => {
    if (!project?.id) return;
    const filesRes = await fetch(`/api/projects/${project.id}/files`).then((r) =>
      r.ok ? r.json() : { files: [] }
    );
    setFiles(filesRes.files || []);
  }, [project?.id]);

  const fetchRoadmapStats = useCallback(
    async ({ silent = false } = {}) => {
      if (!project?.id) return { milestoneCount: 0, taskCount: 0 };
      if (!silent) setLoading(true);

      const [msRes, tasksRes] = await Promise.all([
        db.from('milestones').select('id, title, status').eq('project_id', project.id),
        db.from('tasks').select('id, status').eq('project_id', project.id),
      ]);

      const nextMilestones = msRes.data || [];
      const nextTasks = tasksRes.data || [];
      setMilestones(nextMilestones);
      setTasks(nextTasks);
      if (!silent) setLoading(false);

      return { milestoneCount: nextMilestones.length, taskCount: nextTasks.length };
    },
    [project?.id, db]
  );

  useEffect(() => {
    if (!project) return;
    setPlanningPrompt(project.planning_prompt || '');
    setProjectType(project.project_type || DEFAULT_PROJECT_TYPE);
    setDocumentationPolicy(project.documentation_policy || DEFAULT_DOCUMENTATION_POLICY);
    modeTouchedRef.current = false;
  }, [project?.id, project?.planning_prompt, project?.project_type, project?.documentation_policy]);

  useEffect(() => {
    if (!project?.id) return;

    let cancelled = false;

    (async () => {
      const counts = await fetchRoadmapStats();
      if (cancelled) return;
      await fetchFiles();
      if (cancelled || modeTouchedRef.current) return;

      const paramMode = searchParams.get('mode');
      if (paramMode && PLANNING_MODES.some((m) => m.id === paramMode)) {
        setMode(paramMode);
        return;
      }

      setMode(
        resolveDefaultPlanningMode({
          taskCount: counts?.taskCount ?? 0,
          milestoneCount: counts?.milestoneCount ?? 0,
          planningStatus: project?.planning_status,
        })
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [project?.id, searchParams, project?.planning_status, fetchRoadmapStats, fetchFiles]);

  // Poll roadmap stats only while an agent is actively planning.
  useEffect(() => {
    if (!project?.id || project.planning_status !== 'pending') return;

    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      fetchRoadmapStats({ silent: true });
    };

    const intervalId = setInterval(poll, 15000);
    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', poll);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', poll);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [project?.id, project?.planning_status, fetchRoadmapStats]);

  async function saveContext({ markPending = false } = {}) {
    if (!project?.id) return false;
    setSaving(true);

    const payload = {
      ...buildProjectUpdatePayload({
        name: project.name,
        description: project.description,
        color: project.color,
        status: project.status,
        local_path: project.local_path,
        planning_prompt: planningPrompt,
        project_type: projectType,
        documentation_policy: documentationPolicy,
      }),
      ...(markPending ? { planning_status: 'pending' } : {}),
    };

    const { error } = await db.from('projects').update(payload).eq('id', project.id);
    setSaving(false);

    if (error) {
      toast.error('Error al guardar contexto');
      return false;
    }

    toast.success(markPending ? 'Contexto guardado — planning en curso' : 'Contexto guardado');
    return true;
  }

  async function uploadFiles(fileList) {
    if (!project?.id) return;

    const pending = [];
    for (const file of Array.from(fileList)) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!ACCEPTED_TYPES.includes(ext)) {
        toast.error(`Tipo no soportado: ${file.name}`);
        continue;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast.error(`Demasiado grande: ${file.name}`);
        continue;
      }
      const content = await file.text();
      pending.push({ file_name: file.name, content, file_type: ext.replace('.', '') });
    }

    if (pending.length === 0) return;

    const res = await fetch(`/api/projects/${project.id}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: pending, user_id: 'local-user' }),
    });

    if (!res.ok) {
      toast.error('Error al subir archivos');
      return;
    }

    toast.success(`${pending.length} archivo(s) subido(s)`);
    fetchFiles();
  }

  async function deleteFile(fileId) {
    if (!project?.id) return;
    const res = await fetch(`/api/projects/${project.id}/files?file_id=${fileId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.error('No se pudo eliminar el archivo');
      return;
    }
    toast.success('Archivo eliminado');
    fetchFiles();
  }

  async function handleStartPlanning() {
    // Preflight (Fase 3 — FR-PL04, FR-PL05): async-validate OpenCode + LLM +
    // MCP before launching. If any required subsystem is unhealthy, render
    // the first Spanish error in the inline banner and stop. We do NOT
    // navigate; we do NOT call `launchPlanningAgent`; we do NOT touch
    // `persistAgentRunMetadata`. The existing synchronous `hasContext` guard
    // below is preserved unchanged — it is the same logic but happens
    // locally before the preflight has a chance to read network state, and
    // removing it would regress the "no context" toast the user is used to.
    const preflight = await validatePlanningLaunch({
      projectId: project.id,
      documentationPolicy,
      localPath: project?.local_path,
      hasContext: !!(planningPrompt.trim() || files.length > 0),
    });
    setPreflightChecks(preflight.checks || []);
    if (preflight.ok !== true) {
      const firstError = (preflight.checks || []).find(
        (c) => c && c.ok === false && c.level === 'error'
      );
      setPreflightError(
        firstError?.message || 'Preflight falló sin detalle. Revisá OpenCode, LLM y MCP.'
      );
      return;
    }
    setPreflightError(null);

    // Existing synchronous guard — kept per Fase 3 spec.
    if (!planningPrompt.trim() && files.length === 0) {
      toast.error('Agregá contexto en el prompt o subí al menos un archivo');
      return;
    }

    setLaunching(true);
    const ok = await saveContext({ markPending: true });
    setLaunching(false);
    if (!ok) return;

    launchPlanningAgent(navigate, {
      projectId: project.id,
      projectName: project.name,
      mode,
      documentationPolicy,
      hasExistingWork: tasks.length > 0 || milestones.length > 0,
    });
    toast.success('Agente de planificación lanzado en terminales');
  }

  function handleCopyPrompt() {
    const text = buildPlanningCopyPrompt(mode, {
      projectId: project.id,
      projectName: project.name,
      fileNames: files.map((f) => f.file_name),
    });
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Prompt copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  }

  const planningStatus = project?.planning_status || 'none';
  const statusLabel =
    planningStatus === 'pending'
      ? 'En planificación'
      : planningStatus === 'completed'
        ? 'Planificado'
        : 'Sin planificar';

  const statusTone =
    planningStatus === 'pending' ? 'warning' : planningStatus === 'completed' ? 'success' : 'neutral';

  return (
    <div className="h-full flex flex-col" style={getWorkspacePageShellStyle()}>
      <div
        className="sticky top-0 z-10 border-b px-6 py-3 flex items-center justify-between gap-4"
        style={getWorkspacePageHeaderStyle()}
      >
        <WorkspacePageTitle icon={Brain} title="Planificación" projectName={project?.name} />
        <div className="flex items-center gap-2">
          <span
            className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={getWorkspaceStatusPillStyle({ tone: statusTone })}
          >
            {statusLabel}
          </span>
          <Button
            type="button"
            variant="devhubGlass"
            size="sm"
            className="rounded-none text-xs"
            onClick={() => saveContext()}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={getWorkspacePageContentStyle()}>
        <p className="text-sm text-text-muted mb-6 max-w-2xl">
          Investigá el alcance, cargá contexto y delegá la generación del roadmap al agente. La
          ejecución diaria sigue en Tareas y Roadmap.
        </p>

        {/* Mode selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {PLANNING_MODES.map((item) => {
            const selected = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  modeTouchedRef.current = true;
                  setMode(item.id);
                }}
                className="text-left border-2 px-4 py-3 transition-all cursor-pointer"
                style={{
                  ...getWorkspaceSectionSurfaceStyle({ emphasized: selected }),
                  borderColor: selected ? 'var(--accent-primary)' : 'var(--chrome-border-color)',
                }}
              >
                <p className="text-xs font-bold text-text-primary mb-1">{item.label}</p>
                <p className="text-[11px] text-text-muted leading-relaxed">{item.description}</p>
              </button>
            );
          })}
        </div>

        {/* Stats */}
        <div
          className="flex flex-wrap items-center gap-3 mb-6 px-4 py-3 border"
          style={getWorkspaceSectionSurfaceStyle()}
        >
          <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <Milestone className="w-3.5 h-3.5" />
            {loading ? '…' : milestones.length} hitos
          </span>
          <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <ListTodo className="w-3.5 h-3.5" />
            {loading ? '…' : tasks.length} tareas
          </span>
          <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <FileText className="w-3.5 h-3.5" />
            {loading ? '…' : files.length} archivos
          </span>
          <span className="text-[10px] text-text-muted ml-auto">
            {planningPrompt.length} caracteres de contexto
          </span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Context column */}
          <div className="space-y-4">
            <div className="border overflow-hidden" style={getWorkspaceSectionSurfaceStyle({ emphasized: true })}>
              <div className="px-4 py-3" style={getWorkspaceSectionHeaderStripStyle({ tone: 'accent' })}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                  Contexto e investigación
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <textarea
                  rows={8}
                  value={planningPrompt}
                  onChange={(e) => setPlanningPrompt(e.target.value)}
                  placeholder="¿Qué querés construir? Alcance, stack, restricciones, plazos, referencias..."
                  className="w-full resize-y font-mono text-xs placeholder:text-text-muted"
                  style={fieldStyle}
                />

                <div
                  ref={dropRef}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    uploadFiles(e.dataTransfer.files);
                  }}
                  onClick={() => document.getElementById('planificacion-file-input')?.click()}
                  className={`border border-dashed px-4 py-3 flex items-center gap-3 cursor-pointer transition-all ${
                    isDragging
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5'
                      : 'border-borders-strong hover:bg-surface-elevated'
                  }`}
                >
                  <input
                    id="planificacion-file-input"
                    type="file"
                    multiple
                    accept={ACCEPTED_TYPES.join(',')}
                    className="hidden"
                    onChange={(e) => uploadFiles(e.target.files)}
                  />
                  <Upload className="w-4 h-4 text-text-muted shrink-0" strokeWidth={1.5} />
                  <div>
                    <p className="text-xs text-text-muted">Arrastrá specs, READMEs, notas de investigación</p>
                    <p className="text-[10px] text-text-muted">.txt .md .json .py .js — máx 2MB</p>
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="space-y-1.5">
                    {files.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center gap-2 px-3 py-1.5 border"
                        style={pillStyle()}
                      >
                        <FileText className="w-3 h-3 text-accent-primary shrink-0" />
                        <span className="text-xs font-mono flex-1 truncate">{f.file_name}</span>
                        <span className="text-[10px] text-text-muted">
                          {Math.round((f.size_chars || 0) / 1024)}KB
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteFile(f.id)}
                          className="text-text-muted hover:text-danger cursor-pointer"
                          aria-label={`Eliminar ${f.file_name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Classification + actions */}
          <div className="space-y-4">
            <div className="border overflow-hidden" style={getWorkspaceSectionSurfaceStyle()}>
              <div className="px-4 py-3" style={getWorkspaceSectionHeaderStripStyle()}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                  Clasificación del proyecto
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-[11px] font-medium text-text-muted mb-2">Tipo de proyecto</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PROJECT_TYPE_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setProjectType(value)}
                        className="px-2.5 py-1 text-[11px] border cursor-pointer transition-all"
                        style={
                          projectType === value
                            ? {
                                ...pillStyle({ tone: 'accent' }),
                                color: 'var(--accent-primary)',
                              }
                            : pillStyle()
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-medium text-text-muted mb-2">Política de documentación</p>
                  <div className="space-y-2">
                    {DOCUMENTATION_POLICY_OPTIONS.map(({ value, label, description }) => {
                      const selected = documentationPolicy === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setDocumentationPolicy(value)}
                          className="w-full border px-3 py-2 text-left cursor-pointer transition-all"
                          style={getWorkspaceSectionSurfaceStyle({ emphasized: selected })}
                        >
                          <span className="text-xs font-semibold text-text-primary">{label}</span>
                          <p className="text-[10px] text-text-muted mt-0.5">{description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="border p-4 space-y-3" style={getWorkspaceSectionSurfaceStyle({ emphasized: true })}>
              <div className="flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-[var(--project-type-university,#D2A8FF)] shrink-0 mt-0.5" />
                <p className="text-[11px] text-text-muted leading-relaxed">
                  El agente leerá tu contexto vía MCP, creará hitos y tareas, y cerrará el ciclo
                  marcando el planning como completado.
                </p>
              </div>

              {preflightError && (
                <div
                  role="alert"
                  data-testid="preflight-error-banner"
                  className="px-3 py-2 border text-xs leading-relaxed"
                  style={{
                    borderColor: 'var(--chrome-border-color)',
                    background: 'var(--surface-elevated, rgba(248, 113, 113, 0.08))',
                    color: 'var(--text-primary, inherit)',
                  }}
                >
                  <p className="font-semibold mb-1">Preflight bloqueó el lanzamiento</p>
                  <p data-testid="preflight-error-message">{preflightError}</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleStartPlanning}
                disabled={launching || saving}
                className="w-full inline-flex items-center justify-center gap-2 h-10 text-sm font-semibold transition-all cursor-pointer disabled:opacity-60"
                style={btnPrimaryStyle()}
              >
                {launching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Iniciar planificación con agente
              </button>

              <button
                type="button"
                onClick={handleCopyPrompt}
                className="w-full inline-flex items-center justify-center gap-2 h-9 text-xs transition-all cursor-pointer"
                style={btnSecondaryStyle({ size: 'sm' })}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copiar prompt para agente externo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
