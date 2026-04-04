'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  History,
  Loader2,
  Calendar,
  ChevronDown,
  Download,
  BarChart3,
  Flag,
  Hash,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import { getUIPrefs, hasUIPref, saveUIPref } from '@/lib/uiState';

const STATUS_COLORS = {
  completed: { color: '#3FB950', bg: 'bg-[#3FB950]/10', text: 'text-success', label: 'Completada' },
  in_progress: {
    color: '#58A6FF',
    bg: 'bg-[#58A6FF]/10',
    text: 'text-accent-primary',
    label: 'En Progreso',
  },
  pending: { color: '#8B949E', bg: 'bg-[#8B949E]/10', text: 'text-text-muted', label: 'Pendiente' },
  blocked: { color: '#F778BA', bg: 'bg-[#F778BA]/10', text: 'text-danger', label: 'Bloqueada' },
};

const PRIORITY_COLORS = {
  critical: '#F778BA',
  high: '#FFA657',
  medium: '#E3B341',
  low: '#8B949E',
};

function groupByMonth(tasks) {
  const groups = {};
  for (const t of tasks) {
    const date = t.completed_at || t.updated_at || t.created_at;
    const key = new Date(date).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return groups;
}

const FILTER_OPTIONS = [
  { key: 'all', label: 'Todo' },
  { key: 'completed', label: 'Completadas' },
  { key: 'in_progress', label: 'En progreso' },
  { key: 'pending', label: 'Pendientes' },
];

export default function Historial() {
  const { project } = useOutletContext() || {};
  const db = createClient();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [uiPrefsReady, setUiPrefsReady] = useState(false);

  const exportarCSV = () => {
    const header = 'fecha,tarea,estado,prioridad,creada\n';
    const csv = tasks
      .map((t) => {
        const fecha = t.completed_at || t.updated_at || t.created_at;
        return `${new Date(fecha).toISOString()},${t.title},${t.status},${t.priority},${t.created_at}`;
      })
      .join('\n');
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial_swarm_${project?.id || 'export'}.csv`;
    a.click();
  };

  const fetchHistory = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    const { data, error } = await db
      .from('tasks')
      .select('*')
      .eq('project_id', project.id)
      .order('updated_at', { ascending: false });

    if (!error && data) setTasks(data);
    setLoading(false);
  }, [project?.id]);

  useEffect(() => {
    if (!project?.id) return;

    const prefs = getUIPrefs(project.id);
    const nextExpanded = hasUIPref(project.id, 'historialExpandedMonths')
      ? (prefs.historialExpandedMonths || []).reduce((acc, month) => {
          acc[month] = true;
          return acc;
        }, {})
      : {};

    setUiPrefsReady(false);
    setExpanded(nextExpanded);
    setUiPrefsReady(true);
  }, [project?.id]);

  useEffect(() => {
    fetchHistory();
    if (!project?.id) return;
    const channel = db
      .channel(`historial-${project.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${project.id}` },
        () => {
          fetchHistory();
        }
      )
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [project?.id, fetchHistory]);

  const filtered = filterStatus === 'all' ? tasks : tasks.filter((t) => t.status === filterStatus);
  const grouped = groupByMonth(filtered);

  const handleToggleMonth = (month) => {
    setExpanded((current) => {
      const isOpen = current[month] === true;
      const next = { ...current, [month]: !isOpen };
      if (project?.id && uiPrefsReady) {
        const nextOpenMonths = Object.entries(next)
          .filter(([, value]) => value)
          .map(([key]) => key);
        saveUIPref(project.id, 'historialExpandedMonths', nextOpenMonths);
      }
      return next;
    });
  };

  return (
    <div
      className="min-h-screen core-page-shell"
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
    >
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-10 core-sticky-header border-b px-6 py-3 flex items-center justify-between"
        style={{
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: '#D2A8FF18', border: '1px solid #D2A8FF30' }}
          >
            <History className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: '#D2A8FF' }} />
          </div>
          <h1 className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Historial de Actividad
          </h1>
          {project?.name && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-borders-strong text-text-muted">
              {project.name}
            </span>
          )}
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
          >
            {filtered.length} registros
          </span>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1">
          {FILTER_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                filterStatus === key
                  ? 'text-text-primary'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-elevated border-transparent'
              }`}
              style={
                filterStatus === key
                  ? {
                      background: 'var(--surface-elevated)',
                      borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                      boxShadow: 'var(--shadow-soft)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              {label}
            </button>
          ))}
        </div>
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
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {project?.name || 'Proyecto'}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ›
          </span>
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Historial
          </span>
        </div>

        {/* Export & Stats */}
        <div className="space-y-6">
          {/* Stats card */}
          <div
            className="rounded-2xl overflow-hidden fade-in-up"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-soft)',
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
                    background: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)',
                  }}
                >
                  <BarChart3 className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div>
                  <h3
                    className="font-mono text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Resumen del Swarm
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Estado actual de todas las tareas del proyecto
                  </p>
                </div>
              </div>
              <button
                onClick={exportarCSV}
                className="inline-flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-all"
                style={{
                  background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
                  color: 'var(--success)',
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Tareas', value: tasks.length, color: 'var(--text-primary)' },
                  {
                    label: 'Completadas',
                    value: tasks.filter((t) => t.status === 'completed').length,
                    color: 'var(--success)',
                  },
                  {
                    label: 'En Progreso',
                    value: tasks.filter((t) => t.status === 'in_progress').length,
                    color: 'var(--accent-primary)',
                  },
                  {
                    label: 'Bloqueadas',
                    value: tasks.filter((t) => t.status === 'blocked').length,
                    color: 'var(--danger)',
                  },
                ].map((s, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl"
                    style={{ background: 'var(--surface-muted)' }}
                  >
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                      {s.label}
                    </p>
                    <p className="font-mono text-xl font-bold" style={{ color: s.color }}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2
                className="w-7 h-7 animate-spin"
                style={{ color: 'var(--accent-primary)' }}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="rounded-2xl overflow-hidden fade-in-up"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <History
                    className="w-7 h-7"
                    strokeWidth={1.5}
                    style={{ color: 'var(--text-muted)' }}
                  />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  No hay actividad registrada aún.
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Las tareas creadas y modificadas aparecerán aquí.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 fade-in-up">
              {Object.entries(grouped).map(([month, monthTasks]) => {
                const isOpen = expanded[month] === true;
                return (
                  <div
                    key={month}
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: 'var(--surface-card)',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: 'var(--shadow-soft)',
                    }}
                  >
                    <button
                      onClick={() => handleToggleMonth(month)}
                      className="flex items-center gap-3 w-full text-left px-6 py-4 transition-colors cursor-pointer"
                      style={{ borderBottom: isOpen ? '1px solid var(--border-subtle)' : 'none' }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{
                          background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                          border:
                            '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                        }}
                      >
                        <Calendar
                          className="w-4 h-4"
                          strokeWidth={1.5}
                          style={{ color: 'var(--accent-primary)' }}
                        />
                      </div>
                      <div className="flex-1">
                        <h3
                          className="font-mono text-sm font-semibold capitalize"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {month}
                        </h3>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {monthTasks.length} tarea{monthTasks.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                        strokeWidth={1.5}
                        style={{ color: 'var(--text-muted)' }}
                      />
                    </button>

                    {isOpen && (
                      <div className="p-6">
                        <div className="relative ml-2">
                          <div
                            className="absolute left-4 top-0 bottom-0 w-px"
                            style={{ background: 'var(--border-subtle)' }}
                          />
                          <div className="space-y-3">
                            {monthTasks.map((task, i) => {
                              const st = STATUS_COLORS[task.status] || STATUS_COLORS.pending;
                              const prioColor = PRIORITY_COLORS[task.priority] || '#8B949E';
                              const date = new Date(task.updated_at || task.created_at);
                              return (
                                <div
                                  key={task.id}
                                  className="fade-in-up flex items-start gap-4 pl-8 relative"
                                  style={{ animationDelay: `${i * 30}ms` }}
                                >
                                  <div
                                    className="absolute left-3.5 top-3 w-2.5 h-2.5 rounded-full -translate-x-1/2"
                                    style={{
                                      background: st.color,
                                      boxShadow: `0 0 0 4px var(--surface-card), 0 0 6px ${st.color}40`,
                                    }}
                                  />
                                  <div
                                    className="flex-1 rounded-xl p-4 transition-all hover:border-[var(--border-strong)]"
                                    style={{
                                      background: 'var(--surface-muted)',
                                      border: '1px solid var(--border-subtle)',
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <p
                                        className="text-sm font-medium leading-snug"
                                        style={{ color: 'var(--text-primary)' }}
                                      >
                                        {task.title}
                                      </p>
                                      <span
                                        className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
                                        style={{
                                          background: `${st.color}18`,
                                          color: st.color,
                                          border: `1px solid ${st.color}30`,
                                        }}
                                      >
                                        {st.label}
                                      </span>
                                    </div>
                                    {task.description && (
                                      <p
                                        className="text-xs mt-1.5 leading-relaxed line-clamp-2"
                                        style={{ color: 'var(--text-muted)' }}
                                      >
                                        {task.description}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-3 mt-2.5">
                                      <span
                                        className="text-xs font-medium flex items-center gap-1"
                                        style={{ color: prioColor }}
                                      >
                                        <Flag className="w-3 h-3" />
                                        {task.priority || 'medium'}
                                      </span>
                                      <span
                                        className="text-xs"
                                        style={{ color: 'var(--text-muted)' }}
                                      >
                                        {date.toLocaleDateString('es-ES', {
                                          day: '2-digit',
                                          month: 'short',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                      {task.due_date && (
                                        <span
                                          className="text-xs flex items-center gap-1"
                                          style={{ color: 'var(--text-muted)' }}
                                        >
                                          <Calendar className="w-3 h-3" />
                                          {new Date(task.due_date).toLocaleDateString('es-ES', {
                                            day: '2-digit',
                                            month: 'short',
                                          })}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
