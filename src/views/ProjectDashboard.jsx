'use client';
import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Plus,
  CheckCircle2,
  ListTodo,
  Clock,
  Loader2,
  MapPin,
  AlertTriangle,
  CalendarClock,
  Hash,
  LayoutDashboard,
  Trophy,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import { Button } from '@/components/ui/button';

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
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const compPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const accentColor = project?.color || '#58A6FF';

  // Predicción basada en velocity pseudo-real (Asumimos inicio con creation del primer task o proyecto, si no existe usamos 7 dias)
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

  const stats = [
    { label: 'Tareas totales', value: total, color: '#8B949E', icon: ListTodo },
    { label: 'Completadas', value: completed, color: '#3FB950', icon: CheckCircle2 },
    { label: 'En progreso', value: inProgress, color: '#58A6FF', icon: Clock },
    { label: 'Bloqueadas', value: blocked, color: '#F778BA', icon: AlertTriangle },
  ];

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
    <div
      className="h-full flex flex-col"
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
    >
      {/* Page Content */}
      <div className="flex-1">
        <div className="px-6 pt-6 pb-6 w-full max-w-[1280px] mx-auto">
          <div className="mb-6 flex items-center justify-end">
            <Button
              onClick={() => navigate(`/project/${project?.id}/tareas`)}
              variant="devhubPrimary"
              size="toolbar"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              Nueva Tarea
            </Button>
          </div>
          {/* Breadcrumb */}
          <div
            className="rounded-xl border px-4 py-2.5 flex items-center gap-2 mb-6"
            style={{ background: 'var(--surface-card)', borderColor: 'var(--border-subtle)' }}
          >
            <Hash className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Proyectos
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              ›
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {project?.name}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              ›
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Dashboard
            </span>
          </div>

          <div className="fade-in-up space-y-6">
            {/* Stats cards */}
            <div
              className="rounded-2xl overflow-hidden reveal-on-scroll"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 14px 36px rgba(0,0,0,0.22)',
              }}
            >
              <div
                className="flex items-center gap-3 px-6 py-4"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}30` }}
                >
                  <LayoutDashboard className="w-4 h-4" style={{ color: accentColor }} />
                </div>
                <div>
                  <h3
                    className="font-mono text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Resumen del Proyecto
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Estado actual de tareas y progreso general
                  </p>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
                  {stats.map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={i}
                        className="rounded-xl px-4 py-3 flex items-center justify-between transition-all duration-300 hover:-translate-y-0.5"
                        style={{
                          background:
                            'linear-gradient(135deg, color-mix(in srgb, var(--surface-muted) 88%, transparent), color-mix(in srgb, var(--surface-card) 90%, transparent))',
                          border:
                            '1px solid color-mix(in srgb, var(--border-subtle) 86%, transparent)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                        }}
                      >
                        <div>
                          <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>
                            {stat.label}
                          </p>
                          <p className="font-mono text-xl font-bold" style={{ color: stat.color }}>
                            {stat.value}
                          </p>
                        </div>
                        <Icon className="w-5 h-5" style={{ color: stat.color }} strokeWidth={1.5} />
                      </div>
                    );
                  })}
                </div>

                {/* Progress bar */}
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      Progreso General
                    </p>
                    <span
                      className="font-mono text-2xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {compPct}%
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{
                      background:
                        'linear-gradient(180deg, color-mix(in srgb, var(--surface-elevated) 92%, black), color-mix(in srgb, var(--surface-muted) 88%, black))',
                    }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${compPct}%`,
                        background: `linear-gradient(90deg, ${accentColor}, color-mix(in srgb, ${accentColor} 55%, #3FB950), #3FB950)`,
                        boxShadow: `0 0 12px color-mix(in srgb, ${accentColor} 55%, transparent)`,
                      }}
                    />
                  </div>
                  <div
                    className="flex justify-between text-xs mt-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span>{completed} completadas</span>
                    <span>{total - completed} pendientes</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Next milestone + Delivery Prediction */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger-children">
              {/* Next milestone */}
              <div
                className="rounded-2xl overflow-hidden reveal-on-scroll"
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
                }}
              >
                <div
                  className="flex items-center gap-3 px-6 py-4"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: '#E3B34118', border: '1px solid #E3B34130' }}
                  >
                    <MapPin className="w-4 h-4" style={{ color: '#E3B341' }} />
                  </div>
                  <div>
                    <h3
                      className="font-mono text-sm font-semibold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Próximo Hito
                    </h3>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Siguiente entrega planificada del proyecto
                    </p>
                  </div>
                </div>

                <div className="p-6">
                  {nextMilestone ? (
                    <div>
                      <p
                        className="text-sm font-semibold mb-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {nextMilestone.title}
                      </p>
                      {nextMilestone.description && (
                        <p
                          className="text-xs mb-3 line-clamp-2"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {nextMilestone.description}
                        </p>
                      )}
                      {nextMilestone.due_date && (
                        <span
                          className="text-xs flex items-center gap-1"
                          style={{ color: '#E3B341' }}
                        >
                          <Clock className="w-3 h-3" />
                          {new Date(nextMilestone.due_date).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'long',
                          })}
                        </span>
                      )}
                    </div>
                  ) : milestones.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
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
                      className="text-xs flex items-center gap-1.5"
                      style={{ color: 'var(--success)' }}
                    >
                      <Trophy className="w-3.5 h-3.5 text-yellow-400" /> ¡Todos los hitos
                      completados!
                    </p>
                  )}
                </div>
              </div>

              {/* Delivery Prediction AI Card */}
              <div
                className="rounded-2xl overflow-hidden relative reveal-on-scroll"
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
                }}
              >
                <div
                  className="absolute top-0 left-0 w-full h-1"
                  style={{
                    background: `linear-gradient(90deg, ${accentColor} 0%, color-mix(in srgb, ${accentColor} 38%, white) 100%)`,
                  }}
                />
                <div
                  className="flex items-center gap-3 px-6 py-4"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{
                      background: `${accentColor}18`,
                      border: `1px solid ${accentColor}30`,
                    }}
                  >
                    <CalendarClock className="w-4 h-4" style={{ color: accentColor }} />
                  </div>
                  <div className="flex-1">
                    <h3
                      className="font-mono text-sm font-semibold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Fecha Estimada de Entrega
                    </h3>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Predicción basada en velocidad del equipo
                    </p>
                  </div>
                  <span
                    className="text-xs uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border"
                    style={{
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-muted)',
                      background: 'var(--surface-elevated)',
                    }}
                  >
                    IA
                  </span>
                </div>

                <div className="p-6">
                  {prediction ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: 'var(--text-muted)' }}>Optimista</span>
                        <span className="font-mono" style={{ color: 'var(--success)' }}>
                          {prediction.optimistic.toLocaleDateString('es-ES')}
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-between font-bold text-sm px-2 py-1.5 rounded"
                        style={{ background: 'var(--surface-elevated)' }}
                      >
                        <span style={{ color: 'var(--text-primary)' }}>Realista</span>
                        <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
                          {prediction.realistic.toLocaleDateString('es-ES')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: 'var(--text-muted)' }}>Pesimista</span>
                        <span className="font-mono" style={{ color: 'var(--danger)' }}>
                          {prediction.pessimistic.toLocaleDateString('es-ES')}
                        </span>
                      </div>

                      <div
                        className="pt-2 mt-2 flex justify-between text-xs"
                        style={{ borderTop: '1px solid var(--border-subtle)' }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>
                          Velocidad: {prediction.speed} tareas/d
                        </span>
                        <span style={{ color: accentColor }}>
                          Confianza: {prediction.confidence}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      No hay suficientes datos de tareas completadas para calcular una predicción
                      precisa.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Upcoming tasks + Chat */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 reveal-on-scroll">
              {/* Upcoming tasks */}
              <div
                className="lg:col-span-2 rounded-2xl overflow-hidden"
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
                }}
              >
                <div
                  className="flex items-center justify-between px-6 py-4"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{
                        background: 'var(--accent-primary)18',
                        border: '1px solid var(--accent-primary)30',
                      }}
                    >
                      <Clock className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                    </div>
                    <div>
                      <h3
                        className="font-mono text-sm font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Próximas Tareas
                      </h3>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Tareas con fecha límite próximas
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/project/${project?.id}/tareas`)}
                    className="text-xs transition-colors hover:text-[var(--text-primary)] cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Ver todas →
                  </button>
                </div>

                <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {upcomingTasks.length === 0 ? (
                    <p className="px-6 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                      No hay tareas con fecha límite próximas.
                    </p>
                  ) : (
                    upcomingTasks.map((task) => {
                      const isOverdue = new Date(task.due_date) < new Date();
                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-surface-elevated cursor-pointer"
                          style={{ background: 'transparent' }}
                        >
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-xs font-medium truncate"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {task.title}
                            </p>
                            <p
                              className="text-xs mt-0.5"
                              style={{ color: isOverdue ? 'var(--danger)' : 'var(--text-muted)' }}
                            >
                              {isOverdue ? (
                                <span className="inline-flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Vencida:
                                </span>
                              ) : (
                                ''
                              )}
                              {new Date(task.due_date).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                              })}
                            </p>
                          </div>
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background:
                                task.priority === 'critical'
                                  ? 'color-mix(in srgb, var(--danger) 12%, transparent)'
                                  : task.priority === 'high'
                                    ? 'color-mix(in srgb, #FFA657 12%, transparent)'
                                    : 'color-mix(in srgb, #E3B341 12%, transparent)',
                              color:
                                task.priority === 'critical'
                                  ? 'var(--danger)'
                                  : task.priority === 'high'
                                    ? '#FFA657'
                                    : '#E3B341',
                            }}
                          >
                            {task.priority}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
