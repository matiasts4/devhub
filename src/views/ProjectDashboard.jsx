'use client';
import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Plus,
  CheckCircle2,
  ListTodo,
  Clock,
  Loader2,
  AlertTriangle,
  CalendarClock,
  LayoutDashboard,
  Trophy,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import { Button } from '@/components/ui/button';
import { ChromeSurface } from '@/components/ui/chrome-surface';
import { panelStyle, btnPrimaryStyle, progressTrackStyle } from '@/chrome/morphology';
import WorkspacePageTitle from '@/components/workspace/WorkspacePageTitle';
import {
  getWorkspacePageContentStyle,
  getWorkspacePageHeaderStyle,
  getWorkspacePageShellStyle,
  getWorkspaceStatusPillStyle,
} from './workspacePageChrome';

function DashboardPill({ children, className = '', tone = 'neutral', style = undefined }) {
  return (
    <ChromeSurface
      as="span"
      surface="pill"
      tone={tone}
      className={`inline-flex items-center gap-1 ${className}`.trim()}
      style={style}
    >
      {children}
    </ChromeSurface>
  );
}

function SectionLabel({ prefix, headingId, children }) {
  return (
    <div className="flex items-center gap-3">
      <span className="typography-section-label" style={{ color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--accent-primary)' }}>[+]</span> {prefix}
      </span>
      <h3
        className="typography-section-label"
        style={{ color: 'var(--text-primary)' }}
        id={headingId}
      >
        {children}
      </h3>
    </div>
  );
}

function StatCard({ label, value, color, icon: Icon }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3 transition-all duration-150 hover:-translate-y-0.5"
      style={panelStyle()}
    >
      <div className="space-y-1">
        <p className="typography-label">{label}</p>
        <p className="typography-data text-2xl font-black leading-none" style={{ color }}>
          {String(value).padStart(2, '0')}
        </p>
      </div>
      <div className="flex h-10 w-10 items-center justify-center" style={panelStyle()}>
        <Icon className="h-5 w-5" style={{ color: 'var(--text-muted)' }} strokeWidth={1.75} />
      </div>
    </div>
  );
}

export default function ProjectDashboard() {
  const { project } = useOutletContext() || {};
  const navigate = useNavigate();
  const db = createClient();

  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    const [{ data: tasksData }, { data: msData }] = await Promise.all([
      db.from('tasks').select('*').eq('project_id', project.id),
      db
        .from('milestones')
        .select('*')
        .eq('project_id', project.id)
        .order('due_date', { ascending: true }),
    ]);
    setTasks(tasksData || []);
    setMilestones(msData || []);
    setLoading(false);
  }, [project?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const qaReady = tasks.filter((t) => t.status === 'qa_ready').length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const compPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const accentColor = project?.color || '#58A6FF';

  const calculatePrediction = () => {
    if (total === 0 || completed === 0) return null;
    const firstTask =
      tasks.map((t) => new Date(t.created_at)).sort((a, b) => a - b)[0] || new Date();
    const mockStart = new Date(project?.created_at || firstTask);
    const diffTime = Math.abs(new Date() - mockStart);
    const daysElapsed = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const velocityPerDay = completed / daysElapsed;
    if (velocityPerDay === 0) return null;

    const remainingTasks = total - completed;
    const daysToComplete = remainingTasks / velocityPerDay;

    const addDays = (d) => new Date(new Date().setDate(new Date().getDate() + d));

    return {
      optimistic: addDays(daysToComplete * 0.7),
      realistic: addDays(daysToComplete),
      pessimistic: addDays(daysToComplete * 1.5),
      confidence: daysElapsed > 10 ? 'Alta' : daysElapsed > 3 ? 'Media' : 'Baja',
      speed: velocityPerDay.toFixed(1),
    };
  };

  const prediction = calculatePrediction();

  const upcomingTasks = tasks
    .filter((t) => t.status !== 'completed' && t.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);

  const nextMilestone = milestones.find((m) => m.status !== 'completed');

  if (loading) {
    return (
      <div
        className="flex h-full items-center justify-center py-20 min-h-screen"
        style={{ background: 'var(--surface-app)' }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-primary)' }} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col core-page-shell" style={getWorkspacePageShellStyle()}>
      <div
        className="sticky top-0 z-10 core-sticky-header border-b px-6 py-3 flex items-center justify-between"
        style={getWorkspacePageHeaderStyle()}
      >
        <WorkspacePageTitle icon={LayoutDashboard} title="Dashboard" projectName={project?.name} />

        <button
          onClick={() => navigate(`/project/${project?.id}/tareas`)}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 h-8 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--border-strong)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[0px_0px_0_0_var(--border-strong)]"
          style={btnPrimaryStyle({ size: 'sm' })}
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          Nueva Tarea
        </button>
      </div>

      {/* Page Content */}
      <div className="flex-1 overflow-y-auto relative">
        {/* Watermark */}
        <div
          className="absolute top-2 right-4 pointer-events-none select-none z-0"
          style={{
            fontSize: '8rem',
            fontWeight: 900,
            lineHeight: 1,
            color: 'var(--text-muted)',
            opacity: 0.08,
            letterSpacing: '-0.04em',
          }}
        >
          DEVHUB
        </div>

        <div className="relative z-10" style={getWorkspacePageContentStyle()}>
          {/* Section header */}
          <div className="mb-4">
            <h2 className="typography-title">SYSTEM_DASHBOARD</h2>
            <p className="typography-label mt-1">
              Estadísticas brutas de tareas y rendimiento del proyecto.
            </p>
          </div>

          {/* Stats cards - 4 column grid */}
          <ChromeSurface
            className="mb-5 flex flex-col overflow-hidden"
            surface="panel"
            style={panelStyle()}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{
                borderBottom: '2px solid var(--border-strong)',
                background: 'var(--surface-elevated)',
              }}
            >
              <SectionLabel prefix="PROJECT_SUMMARY" headingId="h3-resumen">
                Resumen del Proyecto
              </SectionLabel>
            </div>

            <div className="p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                <StatCard
                  label="Tareas totales"
                  value={total}
                  color="var(--text-muted)"
                  icon={ListTodo}
                />
                <StatCard
                  label="Completadas"
                  value={completed}
                  color="var(--success)"
                  icon={CheckCircle2}
                />
                <StatCard
                  label="En progreso"
                  value={inProgress}
                  color="var(--accent-primary)"
                  icon={Clock}
                />
                <StatCard
                  label="Pendiente revisión"
                  value={qaReady}
                  color="var(--accent-secondary)"
                  icon={Clock}
                />
                <StatCard
                  label="Bloqueadas"
                  value={blocked}
                  color="var(--danger)"
                  icon={AlertTriangle}
                />
              </div>
            </div>
          </ChromeSurface>

          {/* Progress bar */}
          <ChromeSurface className="mb-5 px-4 py-3" surface="panel">
            <div className="flex items-center justify-between mb-2">
              <p className="typography-label">Progreso General</p>
              <span
                className="typography-data text-xl font-black"
                style={{ color: 'var(--text-primary)' }}
              >
                {compPct}%
              </span>
            </div>
            <div style={progressTrackStyle()}>
              <div
                className="h-full transition-all duration-700"
                style={{
                  width: `${compPct}%`,
                  background: 'var(--accent-primary)',
                  borderRadius: '2px',
                }}
              />
            </div>
            <div
              className="flex justify-between text-[10px] font-bold mt-1.5"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>{completed} completadas</span>
              <span>{total - completed} pendientes</span>
            </div>
          </ChromeSurface>

          {/* Main grid: workflow queue (2/3) + metrics (1/3) */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
            {/* Workflow Queue / Upcoming tasks - col-span-2 */}
            <ChromeSurface
              className="xl:col-span-2 flex flex-col overflow-hidden"
              surface="panel"
              style={panelStyle()}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{
                  borderBottom: '2px solid var(--border-strong)',
                  background: 'var(--surface-elevated)',
                }}
              >
                <SectionLabel prefix="PRÓXIMAS_TAREAS" headingId="h3-tareas">
                  Próximas Tareas
                </SectionLabel>
                <button
                  onClick={() => navigate(`/project/${project?.id}/tareas`)}
                  className="text-[10px] font-bold uppercase tracking-wider transition-colors hover:text-[var(--text-primary)] cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Ver todas →
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 p-3">
                {upcomingTasks.length === 0 ? (
                  <p
                    className="px-2 py-4 text-[10px] font-bold"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    No hay tareas con fecha límite próximas.
                  </p>
                ) : (
                  upcomingTasks.map((task) => {
                    const isOverdue = new Date(task.due_date) < new Date();
                    return (
                      <ChromeSurface
                        key={task.id}
                        className="flex items-center justify-between px-3 py-2.5 transition-all duration-150 cursor-pointer hover:-translate-y-0.5"
                        surface="panel"
                        style={{
                          background: 'var(--surface-muted)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-2.5 h-2.5 shrink-0"
                            style={{
                              background: isOverdue ? 'var(--danger)' : 'var(--accent-primary)',
                              animation: !isOverdue
                                ? 'devhub-status-blink 1s steps(1) infinite'
                                : 'none',
                            }}
                          />
                          <div>
                            <p
                              className="text-[10px] font-black uppercase tracking-wider"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {task.title}
                            </p>
                            <p
                              className="text-[9px] font-bold"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {isOverdue ? 'Vencida' : 'Due'}:{' '}
                              {new Date(task.due_date).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                              })}
                            </p>
                          </div>
                        </div>
                        <DashboardPill
                          style={{
                            background:
                              task.priority === 'critical'
                                ? 'rgba(248, 81, 73, 0.12)'
                                : task.priority === 'high'
                                  ? 'rgba(255, 166, 87, 0.12)'
                                  : 'rgba(227, 179, 65, 0.12)',
                            borderColor:
                              task.priority === 'critical'
                                ? 'var(--danger)'
                                : task.priority === 'high'
                                  ? '#FFA657'
                                  : 'var(--accent-primary)',
                            color:
                              task.priority === 'critical'
                                ? 'var(--danger)'
                                : task.priority === 'high'
                                  ? '#FFA657'
                                  : 'var(--accent-primary)',
                          }}
                        >
                          {task.priority}
                        </DashboardPill>
                      </ChromeSurface>
                    );
                  })
                )}
              </div>
            </ChromeSurface>

            {/* Right column: Next milestone + Prediction stacked */}
            <div className="flex flex-col gap-4">
              {/* Next milestone */}
              <ChromeSurface
                className="flex flex-col overflow-hidden"
                surface="panel"
                style={panelStyle()}
              >
                <div
                  className="flex items-center gap-3 px-4 py-3"
                  style={{
                    borderBottom: '2px solid var(--border-strong)',
                    background: 'var(--surface-elevated)',
                  }}
                >
                  <SectionLabel prefix="PRÓXIMO_HITO" headingId="h3-hito">
                    Próximo Hito
                  </SectionLabel>
                </div>

                <div className="p-4">
                  {nextMilestone ? (
                    <div>
                      <p
                        className="text-xs font-black uppercase tracking-wider mb-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {nextMilestone.title}
                      </p>
                      {nextMilestone.description && (
                        <p
                          className="text-[10px] font-bold mb-3 line-clamp-2"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {nextMilestone.description}
                        </p>
                      )}
                      {nextMilestone.due_date && (
                        <DashboardPill
                          style={{
                            border: '1px solid var(--accent-primary)',
                            background: 'rgba(227, 179, 65, 0.12)',
                            color: 'var(--accent-primary)',
                          }}
                        >
                          <Clock className="w-3 h-3" />
                          {new Date(nextMilestone.due_date).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'long',
                          })}
                        </DashboardPill>
                      )}
                    </div>
                  ) : milestones.length === 0 ? (
                    <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                      No hay hitos.{' '}
                      <button
                        onClick={() => navigate(`/project/${project?.id}/roadmap`)}
                        className="hover:underline"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        Crear uno →
                      </button>
                    </p>
                  ) : (
                    <p
                      className="text-[10px] font-bold flex items-center gap-1.5"
                      style={{ color: 'var(--success)' }}
                    >
                      <Trophy className="w-3.5 h-3.5 text-yellow-400" /> ¡Todos los hitos
                      completados!
                    </p>
                  )}
                </div>
              </ChromeSurface>

              {/* Delivery Prediction */}
              <ChromeSurface
                className="relative overflow-hidden flex flex-col"
                surface="panel"
                style={panelStyle({ tone: 'accent' })}
              >
                <div
                  className="absolute top-0 left-0 w-full h-1"
                  style={{
                    background: 'var(--accent-primary)',
                  }}
                />
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    borderBottom: '2px solid var(--accent-primary)',
                    background: 'rgba(227, 179, 65, 0.08)',
                  }}
                >
                  <SectionLabel prefix="DELIVERY_PREDICTION" headingId="h3-prediccion">
                    Fecha Estimada de Entrega
                  </SectionLabel>
                  <DashboardPill
                    style={{
                      border: '1px solid var(--accent-primary)',
                      background: 'rgba(227, 179, 65, 0.12)',
                      color: 'var(--accent-primary)',
                    }}
                  >
                    IA
                  </DashboardPill>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  {prediction ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span style={{ color: 'var(--text-muted)' }}>Optimista</span>
                        <span className="font-mono" style={{ color: 'var(--success)' }}>
                          {prediction.optimistic.toLocaleDateString('es-ES')}
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          border: '1px solid var(--accent-primary)',
                          background: 'rgba(227, 179, 65, 0.12)',
                          borderRadius: '4px',
                        }}
                      >
                        <span style={{ color: 'var(--text-primary)' }}>Realista</span>
                        <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
                          {prediction.realistic.toLocaleDateString('es-ES')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span style={{ color: 'var(--text-muted)' }}>Pesimista</span>
                        <span className="font-mono" style={{ color: 'var(--danger)' }}>
                          {prediction.pessimistic.toLocaleDateString('es-ES')}
                        </span>
                      </div>

                      <div
                        className="pt-2 mt-2 flex justify-between text-[10px] font-bold"
                        style={{
                          borderTop: '1px solid var(--border-strong)',
                        }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>
                          Velocidad: {prediction.speed} tareas/d
                        </span>
                        <span style={{ color: 'var(--accent-primary)' }}>
                          Confianza: {prediction.confidence}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                      No hay suficientes datos de tareas completadas para calcular una predicción
                      precisa.
                    </p>
                  )}
                </div>
              </ChromeSurface>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
