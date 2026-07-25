import { Plus, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { UiHeader } from '@/components/ui/system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { sileo } from 'sileo';
import { createClient } from '@/lib/db/localClient';
import { useAuth } from '@/lib/auth/AuthContext';
import { LOCAL_USER_ID } from '@/lib/constants/local';
import useSupabaseRealtime from '@/hooks/useSupabaseRealtime';

const STATUS_LABELS = {
  active: 'Activo',
  paused: 'En pausa',
  planning: 'Planificando',
  completed: 'Completado',
  archived: 'Archivado',
};

const STATUS_CONFIG = {
  active: 'bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/25',
  paused: 'bg-[#FFE600]/10 text-[#FFE600] border-[#FFE600]/25',
  planning: 'bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/25',
  completed: 'bg-white/10 text-white border-white/20',
  archived: 'bg-slate-500/10 text-slate-400 border-slate-500/25',
};

const FILTERS = ['Todos', 'Activo', 'En pausa', 'Planificando', 'Completado', 'Archivado'];

function statusLabel(status) {
  return STATUS_LABELS[status] || status || 'Desconocido';
}

function statusClass(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.archived;
}

function relativeTime(dateString) {
  if (!dateString) return '—';
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: es });
  } catch {
    return '—';
  }
}

export default function Proyectos() {
  const { activeWorkspaceId, user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Todos');
  const db = createClient();

  const fetchProjects = useCallback(async () => {
    if (!activeWorkspaceId) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await db
        .from('projects')
        .select('*')
        .eq('workspace_id', activeWorkspaceId)
        .order('created_at', { ascending: false });
      if (error) {
        const errorMsg =
          error.message ||
          (typeof error === 'object' && Object.keys(error).length > 0
            ? JSON.stringify(error)
            : String(error || 'Error desconocido'));
        sileo.error({ title: 'Error al cargar proyectos: ' + errorMsg });
      } else {
        setProjects(data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, db]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useSupabaseRealtime({
    table: 'projects',
    filter: activeWorkspaceId ? `workspace_id=eq.${activeWorkspaceId}` : undefined,
    onInsert: fetchProjects,
    onUpdate: fetchProjects,
    onDelete: fetchProjects,
    enabled: Boolean(activeWorkspaceId) && Boolean(user && user.id !== LOCAL_USER_ID),
    channelName: `public:projects:${activeWorkspaceId || 'none'}`,
  });

  const filtered = useMemo(() => {
    if (filter === 'Todos') return projects;
    return projects.filter((p) => statusLabel(p.status) === filter);
  }, [projects, filter]);

  return (
    <div className="h-full bg-surface-app dot-grid flex flex-col">
      <UiHeader sticky data-testid="ui-header">
        <UiHeader.Title>Proyectos</UiHeader.Title>
        <UiHeader.Actions>
          <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
            {projects.length} total
          </span>
          <button
            data-testid="nuevo-proyecto-btn"
            onClick={() =>
              sileo.success({
                title: 'Nuevo proyecto iniciado',
                description: 'NEXUS-7 generará el scaffolding automáticamente.',
              })
            }
            className="flex items-center gap-2 bg-[var(--proyectos-accent-cyan)] text-[#0d1117] font-semibold px-4 py-2 rounded-lg text-xs hover:bg-[var(--proyectos-accent-cyan)]/85 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            Nuevo Proyecto
          </button>
        </UiHeader.Actions>
      </UiHeader>

      <div className="px-6 py-5 flex-1 overflow-auto">
        {/* Filters */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              data-testid={`filtro-${f.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/25'
                  : 'text-slate-400 border border-white/8 hover:border-white/15 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm">
            {activeWorkspaceId
              ? 'No hay proyectos en este workspace.'
              : 'Seleccioná un workspace para ver sus proyectos.'}
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p, i) => (
            <div
              key={p.id}
              data-testid={`proyecto-card-${p.id}`}
              className="fade-in-up bg-surface-card/60 border border-white/8 rounded-xl p-5 hover:border-white/15 hover:bg-surface-card/80 transition-all duration-300 group cursor-pointer"
              style={{
                animationDelay: `${i * 70}ms`,
                borderLeftColor: p.color || '#00F0FF',
                borderLeftWidth: '2px',
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-mono font-semibold text-white text-sm">{p.name}</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {p.project_type ? p.project_type : 'Proyecto'}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusClass(
                    p.status
                  )}`}
                >
                  {statusLabel(p.status)}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-3">
                {p.description || 'Sin descripción'}
              </p>

              {p.project_type && (
                <div className="flex flex-wrap gap-1 mb-4">
                  <span className="text-xs px-2 py-0.5 bg-white/5 border border-white/8 rounded-md text-slate-300 font-mono">
                    {p.project_type}
                  </span>
                </div>
              )}

              <div className="mb-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Progreso</span>
                  <span className="font-mono" style={{ color: p.color || '#00F0FF' }}>
                    {p.progress ?? 0}%
                  </span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${p.progress ?? 0}%`,
                      background: `linear-gradient(90deg, ${p.color || '#00F0FF'}60, ${
                        p.color || '#00F0FF'
                      })`,
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="w-3 h-3" strokeWidth={1.5} />
                  {relativeTime(p.updated_at || p.created_at)}
                </div>
                <ExternalLink
                  className="w-3.5 h-3.5 text-slate-600 group-hover:text-[#00F0FF] transition-colors cursor-pointer"
                  strokeWidth={1.5}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
