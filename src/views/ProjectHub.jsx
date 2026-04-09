'use client';

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import TitleBar from '@/components/TitleBar';
import {
  Plus,
  Search,
  Code2,
  Clock,
  ChevronRight,
  Loader2,
  X,
  Brain,
  Upload,
  FileText,
  Trash2,
  Zap,
  MonitorSmartphone,
  GraduationCap,
  FlaskConical,
  Shield,
  BarChart3,
  Palette,
  Cpu,
  FolderOpen,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import { toast } from 'sonner';
import {
  DOCUMENTATION_POLICY_OPTIONS,
  DEFAULT_DOCUMENTATION_POLICY,
  DEFAULT_PROJECT_TYPE,
  PROJECT_TYPE_OPTIONS,
  buildProjectCreatePayload,
} from '@/lib/projectClassification';

const PROJECT_TYPES_MODAL = [
  { key: 'software', label: 'Software', Icon: MonitorSmartphone, color: '#58A6FF' },
  { key: 'university', label: 'Universidad', Icon: GraduationCap, color: '#D2A8FF' },
  { key: 'research', label: 'Investigación', Icon: FlaskConical, color: '#3FB950' },
  { key: 'security', label: 'Seguridad', Icon: Shield, color: '#E3B341' },
  { key: 'business', label: 'Negocio', Icon: BarChart3, color: '#F78166' },
  { key: 'creative', label: 'Creativo', Icon: Palette, color: '#FF79C6' },
];

const STATUS_CONFIG = {
  active: { label: 'Activo', color: '#3FB950', dot: 'bg-[#3FB950]', animate: true },
  paused: { label: 'Pausado', color: '#E3B341', dot: 'bg-[#E3B341]', animate: false },
  completed: { label: 'Completado', color: '#8B949E', dot: 'bg-[#8B949E]', animate: false },
  archived: { label: 'Archivado', color: '#484F58', dot: 'bg-[#484F58]', animate: false },
};

const ACCENT_COLORS = ['#58A6FF', '#3FB950', '#F778BA', '#D2A8FF', '#E3B341', '#FF7B72'];

export default function ProjectHub() {
  const navigate = useNavigate();
  const db = createClient();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    color: '#6366f1',
    local_path: '',
    planning_prompt: '',
    project_type: DEFAULT_PROJECT_TYPE,
    documentation_policy: DEFAULT_DOCUMENTATION_POLICY,
  });
  const [creating, setCreating] = useState(false);
  const [enablePlanning, setEnablePlanning] = useState(true);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const dropRef = useRef(null);
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

  function processFileList(fileList) {
    Array.from(fileList).forEach((file) => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!ACCEPTED_TYPES.includes(ext)) {
        toast.error(`Tipo no soportado: ${file.name}`);
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast.error(`Demasiado grande: ${file.name}`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) =>
        setPendingFiles((prev) => [
          ...prev,
          {
            file_name: file.name,
            content: ev.target.result,
            file_type: ext.replace('.', ''),
            size: file.size,
          },
        ]);
      reader.readAsText(file);
    });
  }

  // Local-first: no auth needed
  const localUser = { id: 'local-user', email: 'local@devhub.local' };

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    const { data, error } = await db
      .from('projects')
      .select('*, tasks(count)')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('fetchProjects ERROR:', error);
      toast.error('Error al cargar proyectos: ' + error.message);
    }
    if (!error && data) setProjects(data);
    setLoading(false);
  }

  async function handleSelectFolder() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Seleccionar Carpeta del Proyecto',
      });
      if (selected) {
        setNewProject((p) => ({ ...p, local_path: selected }));
      }
    } catch (err) {
      console.warn('No se pudo abrir el selector, ¿estás en web?', err);
    }
  }

  async function createProject(e) {
    e.preventDefault();
    setCreating(true);
    const { data, error } = await db
      .from('projects')
      .insert(
        buildProjectCreatePayload(
          {
            ...newProject,
            planning_prompt: newProject.planning_prompt,
          },
          localUser.id
        )
      )
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      toast.error('Error al crear proyecto: ' + error.message);
      setCreating(false);
      return;
    }

    // Subir archivos de contexto si hay
    if (enablePlanning && pendingFiles.length > 0 && data) {
      await fetch(`/api/projects/${data.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: pendingFiles, user_id: localUser.id }),
      });
    }

    setCreating(false);
    if (data) {
      setShowNewModal(false);
      setNewProject({
        name: '',
        description: '',
        color: '#6366f1',
        local_path: '',
        planning_prompt: '',
        project_type: DEFAULT_PROJECT_TYPE,
        documentation_policy: DEFAULT_DOCUMENTATION_POLICY,
      });
      setPendingFiles([]);
      setEnablePlanning(true);
      navigate(enablePlanning ? `/project/${data.id}/agenthub?plan=1` : `/project/${data.id}/dashboard`);
    }
  }

  const filtered = projects.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = [
    {
      label: 'Proyectos activos',
      value: projects.filter((p) => p.status === 'active').length,
      color: '#3FB950',
    },
    {
      label: 'Total tareas',
      value: projects.reduce((a, p) => a + (p.tasks?.[0]?.count || 0), 0),
      color: '#58A6FF',
    },
    { label: 'Total proyectos', value: projects.length, color: '#D2A8FF' },
    {
      label: 'Completados',
      value: projects.filter((p) => p.status === 'completed').length,
      color: '#E3B341',
    },
  ];

  return (
    <div
      className="min-h-screen core-page-shell dot-grid flex flex-col"
      style={{ background: 'var(--surface-app, #0d1117)' }}
    >
      {/* Compact TitleBar — VS Code / Antigravity style */}
      <TitleBar
        title="DevHub"
        className="bg-[#0d0f14] border-b border-[rgba(255,255,255,0.06)] shrink-0"
        leftSlot={
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#58A6FF]/15 border border-[#58A6FF]/25 flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5 text-accent-primary" strokeWidth={1.5} />
            </div>
            <span className="font-mono font-bold text-text-primary text-[11px] tracking-wide">
              DevHub
            </span>
          </div>
        }
        rightSlot={
          <div className="flex items-center gap-3 pr-2" style={{ WebkitAppRegion: 'no-drag' }}>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted"
                strokeWidth={1.5}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar proyecto..."
                className="bg-surface-card border border-borders-subtle rounded-lg pl-9 pr-4 py-1.5 text-xs text-text-primary placeholder-[#484F58] focus:outline-none focus:border-[var(--accent-primary)] w-52 transition-all"
              />
            </div>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 bg-success text-white font-medium px-4 py-1.5 rounded-lg text-xs hover:bg-success transition-colors active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              Nuevo Proyecto
            </button>
          </div>
        }
      />

      <div className="px-8 py-8">
        {/* Header */}
        <div className="mb-8 fade-in-up">
          <h1 className="font-mono text-3xl font-bold text-text-primary mb-1">
            Bienvenido a DevHub
          </h1>
          <p className="text-text-muted text-sm">
            Selecciona un proyecto para entrar al workspace — o crea uno nuevo.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 stagger-children">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="fade-in-up core-kpi-card rounded-lg px-5 py-4 hover-lift"
              style={{
                animationDelay: `${i * 50}ms`,
                background: 'var(--surface-card, #161b26)',
                borderColor: 'var(--border-subtle, #30363d)',
              }}
            >
              <p className="text-text-muted text-xs mb-1">{stat.label}</p>
              <p className="font-mono text-2xl font-bold" style={{ color: stat.color }}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Status filters */}
        <div
          className="flex items-center gap-2 mb-6 flex-wrap core-panel rounded-xl px-3 py-2"
          style={{ background: 'var(--surface-card, #161b26)' }}
        >
          {[
            { key: 'all', label: 'Todos' },
            ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ key: k, label: v.label })),
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filterStatus === key
                  ? 'bg-surface-elevated text-text-primary border border-[#388BFD]/50'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-elevated border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Projects grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#388BFD] animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
            {filtered.map((project, i) => {
              const estado = STATUS_CONFIG[project.status] || STATUS_CONFIG.active;
              const accentColor = project.color || ACCENT_COLORS[i % ACCENT_COLORS.length];
              return (
                <div
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}/dashboard`)}
                  className="fade-in-up project-card-hover core-panel hover-lift rounded-xl p-5 cursor-pointer group"
                  style={{
                    animationDelay: `${i * 60}ms`,
                    background: 'var(--surface-card, #161b26)',
                    borderColor: 'var(--border-subtle, #30363d)',
                  }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{
                          background: `${accentColor}18`,
                          border: `1px solid ${accentColor}28`,
                        }}
                      >
                        <Code2
                          className="w-4 h-4"
                          strokeWidth={1.5}
                          style={{ color: accentColor }}
                        />
                      </div>
                      <div>
                        <h3 className="font-mono font-semibold text-text-primary text-sm leading-tight">
                          {project.name}
                        </h3>
                        <span className="text-xs font-medium" style={{ color: accentColor }}>
                          Proyecto
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {project.planning_status === 'pending' && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#D2A8FF]/10 border border-[#D2A8FF]/20 text-[#D2A8FF] flex items-center gap-1">
                          <Brain className="w-2.5 h-2.5" />
                          Plan pendiente
                        </span>
                      )}
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${estado.dot} ${estado.animate ? 'animate-pulse' : ''}`}
                      />
                      <span className="text-xs" style={{ color: estado.color }}>
                        {estado.label}
                      </span>
                    </div>
                  </div>

                  {project.description && (
                    <p className="text-xs text-text-muted leading-relaxed mb-4 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="h-[3px] bg-surface-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${project.progress || 0}%`, background: accentColor }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-text-muted">
                        {project.tasks?.[0]?.count || 0} tareas
                      </span>
                      <span className="text-xs text-text-muted">{project.progress || 0}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-text-muted">
                      <Clock className="w-3 h-3" strokeWidth={1.5} />
                      {new Date(project.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Abrir</span>
                      <ChevronRight className="w-3 h-3" strokeWidth={2} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* New project card */}
            <div
              onClick={() => setShowNewModal(true)}
              className="fade-in-up rounded-xl p-5 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all group min-h-[180px] hover:border-[color-mix(in_srgb,var(--accent-primary)_45%,transparent)]"
              style={{
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--surface-card, #161b26) 96%, black), color-mix(in srgb, var(--surface-muted, #111827) 92%, black))',
                border:
                  '1px dashed color-mix(in srgb, var(--accent-primary) 24%, var(--border-subtle))',
              }}
            >
              <div className="w-10 h-10 rounded-full bg-surface-elevated flex items-center justify-center group-hover:bg-[#388BFD]/15 transition-colors cursor-pointer">
                <Plus
                  className="w-5 h-5 text-text-muted group-hover:text-accent-primary transition-colors cursor-pointer"
                  strokeWidth={1.5}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-text-muted group-hover:text-text-primary transition-colors cursor-pointer">
                  Nuevo Proyecto
                </p>
                <p className="text-[11px] text-text-muted">Software, Universidad, Personal...</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-card border border-borders-strong rounded-2xl p-6 w-full max-w-xl shadow-2xl fade-in-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#D2A8FF]/10 border border-[#D2A8FF]/20 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-[#D2A8FF]" strokeWidth={1.5} />
                </div>
                <h2 className="font-mono font-bold text-text-primary">Nuevo Proyecto</h2>
              </div>
              <button
                onClick={() => {
                  setShowNewModal(false);
                  setPendingFiles([]);
                }}
                className="text-text-muted hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createProject} className="space-y-4">
              <div className="rounded-xl border border-[#D2A8FF]/20 bg-[#D2A8FF]/5 p-4 text-xs text-text-muted">
                Definí la clasificación y la política de documentación antes de arrancar el
                planning. Ese gate decide cómo se guarda el contexto y qué documentos deja generar
                DevHub antes de empezar a planificar.
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1.5">
                  Nombre del proyecto *
                </label>
                <input
                  type="text"
                  required
                  value={newProject.name}
                  onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Mi proyecto increíble"
                  className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-colors cursor-pointer"
                />
              </div>

              {/* Ruta Local */}
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1.5">
                  Directorio / Ruta Local
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newProject.local_path}
                    onChange={(e) => setNewProject((p) => ({ ...p, local_path: e.target.value }))}
                    placeholder="/home/usuario/proyectos/mi-proyecto"
                    className="flex-1 bg-surface-app border border-borders-strong rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-colors cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={handleSelectFolder}
                    className="flex items-center justify-center p-2.5 bg-surface-elevated border border-borders-strong rounded-lg text-text-muted hover:text-white hover:bg-surface-active hover:border-text-muted transition-colors tooltip-trigger cursor-pointer"
                    title="Explorar carpetas"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Descripción corta */}
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1.5">
                  Descripción breve
                </label>
                <input
                  type="text"
                  value={newProject.description}
                  onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))}
                  placeholder="¿Qué hace este proyecto en una frase?"
                  className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-colors cursor-pointer"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1.5">
                  Color de acento
                </label>
                <div className="flex items-center gap-3">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewProject((p) => ({ ...p, color: c }))}
                      className="w-7 h-7 rounded-full transition-all hover:scale-110"
                      style={{
                        background: c,
                        outline: newProject.color === c ? `2px solid ${c}` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Toggle Planning IA */}
              <div className="border border-[#D2A8FF]/20 rounded-xl p-4 bg-[#D2A8FF]/4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <Brain className="w-4 h-4 text-[#D2A8FF]" strokeWidth={1.5} />
                    <span className="text-sm font-semibold text-text-primary">
                      Planning IA automático
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnablePlanning(!enablePlanning)}
                    className={`relative w-10 h-5 rounded-full transition-all duration-200 ${
                      enablePlanning ? 'bg-[#D2A8FF]' : 'bg-surface-elevated'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                        enablePlanning ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-text-muted mb-1.5">Tipo de proyecto</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {PROJECT_TYPE_OPTIONS.map(({ value, label }) => {
                        const spec = PROJECT_TYPES_MODAL.find((item) => item.key === value);
                        const sel = newProject.project_type === value;
                        const Icon = spec?.Icon || MonitorSmartphone;
                        const color = spec?.color || '#58A6FF';
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setNewProject((p) => ({ ...p, project_type: value }))}
                            className="flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all"
                            style={
                              sel
                                ? { background: `${color}15`, borderColor: `${color}45` }
                                : { borderColor: 'var(--border-subtle)' }
                            }
                          >
                            <Icon
                              className="w-3.5 h-3.5 flex-shrink-0"
                              strokeWidth={1.5}
                              style={{ color: sel ? color : 'var(--text-muted)' }}
                            />
                            <span
                              className="text-[11px] font-medium truncate"
                              style={{ color: sel ? color : 'var(--text-muted)' }}
                            >
                              {label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1.5">
                      Política de documentación (gate previo)
                    </label>
                    <div className="grid gap-2">
                      {DOCUMENTATION_POLICY_OPTIONS.map(({ value, label, description }) => {
                        const sel = newProject.documentation_policy === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setNewProject((p) => ({ ...p, documentation_policy: value }))
                            }
                            className="text-left rounded-lg border px-3 py-2.5 transition-all"
                            style={
                              sel
                                ? {
                                    background:
                                      'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                                    borderColor:
                                      'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                                  }
                                : { borderColor: 'var(--border-subtle)' }
                            }
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-semibold text-text-primary">
                                {label}
                              </span>
                              <span
                                className="text-[10px] uppercase tracking-wide"
                                style={{
                                  color: sel ? 'var(--accent-primary)' : 'var(--text-muted)',
                                }}
                              >
                                {sel ? 'Seleccionada' : 'Disponible'}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-text-muted">{description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <textarea
                    value={newProject.planning_prompt}
                    onChange={(e) =>
                      setNewProject((p) => ({ ...p, planning_prompt: e.target.value }))
                    }
                    rows={3}
                    placeholder="Describe tu proyecto: qué construirás, contexto, recursos, plazos, requerimientos específicos..."
                    className="w-full bg-surface-app border border-borders-strong rounded-lg px-3 py-2.5 text-xs text-white placeholder-[#484F58] focus:outline-none focus:border-[#D2A8FF]/50 transition-colors resize-none font-mono cursor-pointer"
                  />

                  {enablePlanning && (
                    <>
                      {/* Mini dropzone */}
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
                          processFileList(e.dataTransfer.files);
                        }}
                        onClick={() => document.getElementById('modal-file-input').click()}
                        className={`border border-dashed rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer transition-all ${
                          isDragging
                            ? 'border-[#58A6FF] bg-[#58A6FF]/5'
                            : 'border-borders-strong hover:border-[#D2A8FF]/30 hover:bg-surface-elevated'
                        }`}
                      >
                        <input
                          id="modal-file-input"
                          type="file"
                          multiple
                          accept=".txt,.md,.json,.yaml,.yml,.js,.ts,.py,.jsx,.tsx,.csv"
                          className="hidden"
                          onChange={(e) => processFileList(e.target.files)}
                        />
                        <Upload
                          className="w-4 h-4 text-text-muted flex-shrink-0"
                          strokeWidth={1.5}
                        />
                        <div>
                          <p className="text-xs text-text-muted">
                            Arrastra archivos de contexto (specs, READMEs, wireframes...)
                          </p>
                          <p className="text-xs text-[#484F58]">
                            Opcional · .txt .md .json .py .js .ts — máx 2MB
                          </p>
                        </div>
                      </div>

                      {pendingFiles.length > 0 && (
                        <div className="space-y-1.5">
                          {pendingFiles.map((f, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 bg-surface-elevated rounded-lg px-3 py-1.5"
                            >
                              <FileText className="w-3 h-3 text-[#58A6FF] flex-shrink-0" />
                              <span className="text-xs font-mono text-text-primary flex-1 truncate">
                                {f.file_name}
                              </span>
                              <span className="text-xs text-text-muted">
                                {(f.size / 1024).toFixed(1)}KB
                              </span>
                              <button
                                type="button"
                                onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                                className="text-text-muted hover:text-danger transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-xs text-[#D2A8FF]">
                        <Zap className="w-3 h-3" />
                        Se generarán 40-60+ tareas organizadas en hitos — plan exhaustivo
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewModal(false);
                    setPendingFiles([]);
                  }}
                  className="flex-1 py-2.5 rounded-lg border border-borders-strong text-text-muted text-sm hover:text-white hover:bg-surface-elevated transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold hover:from-blue-400 hover:to-indigo-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {creating
                    ? 'Creando...'
                    : enablePlanning
                      ? 'Crear e ir a Planning'
                      : 'Crear Proyecto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
