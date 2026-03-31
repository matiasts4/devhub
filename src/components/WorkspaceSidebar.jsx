'use client';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ListTodo,
  Bot,
  Layers,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Settings,
  History,
  ArrowLeft,
  Code2,
  Plug2,
  FolderOpen,
  Terminal,
  Brain,
  Cpu,
  Network,
} from 'lucide-react';
import NotificationCenter from './NotificationCenter';
import { createClient } from '@/lib/db/localSupabase';

const allNavItems = {
  dashboard: { icon: LayoutDashboard, label: 'Dashboard' },
  tareas: { icon: ListTodo, label: 'Tareas' },
  agentes: { icon: Bot, label: 'Agentes IA' },
  editor: { icon: FolderOpen, label: 'Sistema de Archivos' },
  scaffolding: { icon: Layers, label: 'Scaffolding' },
  roadmap: { icon: MapPin, label: 'Roadmap' },
  historial: { icon: History, label: 'Historial' },
  planning: { icon: Brain, label: 'Planning IA' },
  swarm: { icon: Cpu, label: 'Swarm Control' },
  cerebro: { icon: Network, label: 'Cerebro / Engram' },
};

const configNavItems = {
  conexiones: { icon: Plug2, label: 'Conexiones MCP' },
  ajustes: { icon: Settings, label: 'Ajustes' },
};

// All pages shown for every project (can be customized per project type later)
const DEFAULT_NAV = [
  'dashboard',
  'tareas',
  'editor',
  'roadmap',
  'historial',
  'agentes',
  'planning',
  'swarm',
  'cerebro',
];

export default function WorkspaceSidebar({
  project,
  collapsed,
  onToggle,
  onToggleTerminal,
  isTerminalOpen,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const [activeAgentsCount, setActiveAgentsCount] = useState(0);

  useEffect(() => {
    if (!project?.id) return;
    const supabase = createClient();

    const fetchAgents = async () => {
      const { data } = await supabase
        .from('agent_registry')
        .select('agent_id')
        .eq('project_id', project.id)
        .in('status', ['working', 'running', 'active', 'thinking', 'asking_questions']);
      setActiveAgentsCount(data?.length || 0);
    };

    fetchAgents();

    const channel = supabase
      .channel('sidebar_agents')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_registry',
          filter: `project_id=eq.${project.id}`,
        },
        () => fetchAgents()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [project?.id]);

  const accentColor = project?.color || '#58A6FF';
  const progressValue = Number.isFinite(Number(project?.progress))
    ? Math.max(0, Math.min(100, Number(project.progress)))
    : 0;

  // Dynamic features logic:
  // If a project has specific features defined, only show those (dashboard is always visible).
  // Otherwise, fallback to DEFAULT_NAV.
  const visibleNavKeys =
    project?.features?.length > 0
      ? DEFAULT_NAV.filter((k) => project.features.includes(k) || k === 'dashboard')
      : DEFAULT_NAV;

  const isActive = (key) => pathname?.includes(`/${key}`);

  const navLinkClass = (key) =>
    `flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'} px-2.5 py-2 rounded-md text-xs font-medium transition-all ${
      isActive(key) || (key === 'terminal' && isTerminalOpen)
        ? 'text-[var(--text-primary)]'
        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
    }`;

  return (
    <aside
      data-testid="workspace-sidebar"
      className={`flex-shrink-0 border-r flex flex-col h-full transition-all duration-250 overflow-hidden ${
        collapsed ? 'w-14' : 'w-58'
      }`}
      style={{
        width: collapsed ? '56px' : '228px',
        background: 'var(--surface-card)',
        borderRightColor: 'var(--border-subtle)',
      }}
    >
      {/* Back to Hub */}
      <div
        className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2'} px-3 py-3 border-b h-12`}
        style={{ borderBottomColor: 'var(--border-subtle)' }}
      >
        <button
          data-testid="back-to-hub"
          onClick={() => navigate('/hub')}
          className="flex items-center gap-2 transition-colors text-xs"
          style={{ color: 'var(--text-muted)' }}
          title={collapsed ? 'Volver a proyectos' : undefined}
        >
          <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Proyectos</span>}
        </button>
      </div>

      {/* Project identity */}
      {!collapsed && (
        <div className="px-3 py-3 border-b" style={{ borderBottomColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}28` }}
            >
              <Code2 className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: accentColor }} />
            </div>
            <div className="min-w-0">
              <p
                className="font-mono text-xs font-semibold truncate leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {project?.name}
              </p>
              <p className="text-[9px] font-medium truncate" style={{ color: accentColor }}>
                {project?.status === 'active' ? 'Activo' : project?.status || 'Proyecto'}
              </p>
            </div>
          </div>
        </div>
      )}
      {collapsed && (
        <div
          className="flex justify-center py-3 border-b"
          style={{ borderBottomColor: 'var(--border-subtle)' }}
        >
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}28` }}
            title={project?.name}
          >
            <Code2 className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: accentColor }} />
          </div>
        </div>
      )}

      <NotificationCenter projectId={project?.id} collapsed={collapsed} />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {!collapsed && (
          <p
            className="px-2.5 pt-1 pb-1.5 text-[9px] uppercase tracking-[0.15em] font-semibold"
            style={{ color: 'var(--text-muted)' }}
          >
            Proyecto
          </p>
        )}
        {visibleNavKeys.map((key) => {
          const item = allNavItems[key];
          if (!item) return null;
          const { icon: Icon, label } = item;
          return (
            <Link
              key={key}
              to={`/project/${project?.id}/${key}`}
              data-testid={`ws-nav-${key}`}
              title={collapsed ? label : undefined}
              className={navLinkClass(key)}
              style={
                isActive(key)
                  ? { background: 'var(--surface-elevated)', boxShadow: 'var(--shadow-soft)' }
                  : undefined
              }
            >
              <div className="relative flex-shrink-0">
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                {key === 'planning' && project?.planning_status === 'pending' && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#D2A8FF] animate-pulse" />
                )}
                {(key === 'agentes' || key === 'swarm') && activeAgentsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-success" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                  </span>
                )}
              </div>
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}

        {/* Config section */}
        <div className="my-2 border-t" style={{ borderTopColor: 'var(--border-subtle)' }} />
        {!collapsed && (
          <p
            className="px-2.5 pt-0.5 pb-1.5 text-[9px] uppercase tracking-[0.15em] font-semibold"
            style={{ color: 'var(--text-muted)' }}
          >
            Herramientas
          </p>
        )}

        {/* Terminal Workspaces Link */}
        <Link
          to={`/project/${project?.id}/terminales`}
          title={collapsed ? 'Vistas de Terminal' : undefined}
          className={navLinkClass('terminales')}
          style={
            isActive('terminales')
              ? { background: 'var(--surface-elevated)', boxShadow: 'var(--shadow-soft)' }
              : undefined
          }
        >
          <Terminal className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Terminales & IDE</span>}
        </Link>

        {Object.entries(configNavItems).map(([key, { icon: Icon, label }]) => (
          <Link
            key={key}
            to={`/project/${project?.id}/${key}`}
            data-testid={`ws-nav-${key}`}
            title={collapsed ? label : undefined}
            className={navLinkClass(key)}
            style={
              isActive(key)
                ? { background: 'var(--surface-elevated)', boxShadow: 'var(--shadow-soft)' }
                : undefined
            }
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
            {!collapsed && <span>{label}</span>}
          </Link>
        ))}
      </nav>

      {/* Project progress bar (bottom) */}
      {!collapsed && project?.progress !== undefined && (
        <div className="px-3 pb-3 border-t pt-3" style={{ borderTopColor: 'var(--border-subtle)' }}>
          <div className="flex justify-between mb-1">
            <span
              className="text-[9px] uppercase tracking-wider font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              Progreso (tareas)
            </span>
            <span className="text-[9px] font-mono" style={{ color: accentColor }}>
              {progressValue}%
            </span>
          </div>
          <div
            className="h-[3px] rounded-full overflow-hidden"
            style={{ background: 'var(--border-subtle)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progressValue}%`, background: accentColor }}
            />
          </div>
        </div>
      )}

      {/* Toggle */}
      <button
        data-testid="sidebar-toggle"
        onClick={onToggle}
        className="flex items-center justify-center py-2.5 border-t transition-all"
        style={{
          borderTopColor: 'var(--border-subtle)',
          color: 'var(--text-muted)',
          background: 'var(--surface-card)',
        }}
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
        ) : (
          <div className="flex items-center gap-1.5 text-[10px]">
            <ChevronLeft className="w-3 h-3" strokeWidth={1.5} />
            <span>Colapsar</span>
          </div>
        )}
      </button>
    </aside>
  );
}
