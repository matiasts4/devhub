'use client';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ListTodo,
  Layers,
  MapPin,
  Settings,
  History,
  ArrowLeft,
  Code2,
  Plug2,
  FolderOpen,
  Terminal,
  Brain,
  Send,
  Cpu,
  Plus,
  Sparkles,
  Radar,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import StatusSignal from '@/components/ui/StatusSignal';

const ACTIVE_AGENT_STATUSES = new Set([
  'working',
  'running',
  'active',
  'thinking',
  'asking_questions',
]);
const HEARTBEAT_FRESH_MS = 90_000;

const allNavItems = {
  dashboard: { icon: LayoutDashboard, label: 'Dashboard' },
  tareas: { icon: ListTodo, label: 'Tareas' },
  editor: { icon: FolderOpen, label: 'Sistema de Archivos' },
  scaffolding: { icon: Layers, label: 'Scaffolding' },
  roadmap: { icon: MapPin, label: 'Roadmap' },
  historial: { icon: History, label: 'Historial' },
  agenthub: { icon: Brain, label: 'Agent Hub' },
  swarm: { icon: Cpu, label: 'Swarm Control' },
  telegram: { icon: Send, label: 'Telegram Bot' },
};

const configNavItems = {
  conexiones: { icon: Plug2, label: 'Conexiones MCP' },
  ajustes: { icon: Settings, label: 'Ajustes' },
};

const DEFAULT_NAV = [
  'dashboard',
  'tareas',
  'editor',
  'roadmap',
  'historial',
  'agenthub',
  'swarm',
  'telegram',
];

const SECTION_CORE = ['dashboard', 'tareas', 'editor', 'roadmap', 'historial'];
const SECTION_AI = ['agenthub', 'swarm', 'telegram'];

function ProgressRing({ value, color = '#58A6FF' }) {
  const radius = 18;
  const stroke = 3;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <svg height={radius * 2} width={radius * 2} className="shrink-0">
      <circle
        stroke="color-mix(in srgb, var(--border-subtle) 90%, transparent)"
        fill="transparent"
        strokeWidth={stroke}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <circle
        stroke={color}
        fill="transparent"
        strokeWidth={stroke}
        strokeLinecap="round"
        style={{
          strokeDasharray: `${circumference} ${circumference}`,
          strokeDashoffset,
          transition: 'stroke-dashoffset 0.5s ease',
          filter: `drop-shadow(0 0 6px ${color}66)`,
        }}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
        transform={`rotate(-90 ${radius} ${radius})`}
      />
    </svg>
  );
}

export default function WorkspaceSidebar({ project, collapsed, isTerminalOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const [activeAgentsCount, setActiveAgentsCount] = useState(0);

  useEffect(() => {
    if (!project?.id) return;
    const db = createClient();

    const fetchAgents = async () => {
      const { data } = await db
        .from('agent_registry')
        .select('agent_id, status, last_heartbeat, updated_at, created_at')
        .eq('project_id', project.id)
        .in('status', ['working', 'running', 'active', 'thinking', 'asking_questions']);

      const activeAgents = (data || []).filter((agent) => {
        const status = (agent.status || '').toLowerCase();
        if (!ACTIVE_AGENT_STATUSES.has(status)) return false;

        const lastSeen = agent.last_heartbeat || agent.updated_at || agent.created_at;
        if (!lastSeen) return false;

        return Date.now() - new Date(lastSeen).getTime() <= HEARTBEAT_FRESH_MS;
      });

      setActiveAgentsCount(activeAgents.length);
    };

    fetchAgents();

    const channel = db
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
      db.removeChannel(channel);
    };
  }, [project?.id]);

  const accentColor = project?.color || '#58A6FF';
  const progressValue = Number.isFinite(Number(project?.progress))
    ? Math.max(0, Math.min(100, Number(project.progress)))
    : 0;

  const visibleNavKeys =
    project?.features?.length > 0
      ? DEFAULT_NAV.filter((k) => project.features.includes(k) || k === 'dashboard')
      : DEFAULT_NAV;

  const isActive = (key) => pathname?.includes(`/${key}`);

  const navCardClass = (active) =>
    `group flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 border cursor-pointer ${
      active
        ? 'text-white shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-primary)_35%,transparent),0_0_20px_color-mix(in_srgb,var(--accent-primary)_18%,transparent)]'
        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
    }`;

  const renderNavSection = (title, keys, withSignals = false) => {
    const filtered = keys.filter((key) => visibleNavKeys.includes(key));
    if (filtered.length === 0) return null;

    return (
      <div className="space-y-1.5">
        {!collapsed && (
          <div className="px-1.5 flex items-center justify-between">
            <p
              className="text-[11px] uppercase tracking-[0.16em] font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              {title}
            </p>
            {withSignals && (
              <StatusSignal
                tone={activeAgentsCount > 0 ? 'success' : 'neutral'}
                animation={activeAgentsCount > 0 ? 'pulse' : 'none'}
                compact
              />
            )}
          </div>
        )}

        {filtered.map((key) => {
          const item = allNavItems[key];
          if (!item) return null;
          const { icon: Icon, label } = item;
          const active = isActive(key) || (key === 'terminales' && isTerminalOpen);

          return (
            <Link
              key={key}
              to={`/project/${project?.id}/${key}`}
              data-testid={`ws-nav-${key}`}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={navCardClass(active)}
              style={
                active
                  ? {
                      background:
                        'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 20%, transparent), color-mix(in srgb, var(--surface-elevated) 92%, transparent))',
                      borderColor: 'color-mix(in srgb, var(--accent-primary) 40%, transparent)',
                    }
                  : {
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border-subtle)',
                    }
              }
            >
              <div className="relative shrink-0">
                <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                {key === 'agenthub' && project?.planning_status === 'pending' && (
                  <span className="absolute -top-1 -right-1">
                    <StatusSignal tone="warning" animation="none" compact />
                  </span>
                )}
                {key === 'swarm' && activeAgentsCount > 0 && (
                  <span className="absolute -top-1 -right-1">
                    <StatusSignal tone="success" animation="pulse" compact />
                  </span>
                )}
              </div>
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <aside
      data-testid="workspace-sidebar"
      className={`flex-shrink-0 border-r flex flex-col h-full transition-all duration-300 overflow-hidden ${
        collapsed ? 'w-16' : 'w-[280px]'
      }`}
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 95%, #02050a 5%), color-mix(in srgb, var(--surface-app) 80%, #000 20%))',
        borderRightColor: 'var(--border-subtle)',
      }}
    >
      {/* Top strip */}
      <div
        className="px-3 py-3 border-b"
        style={{
          borderBottomColor: 'var(--border-subtle)',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 8%, transparent), transparent 55%)',
        }}
      >
        <div
          className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-2`}
        >
          <button
            data-testid="back-to-hub"
            onClick={() => navigate('/hub')}
            aria-label="Volver a proyectos"
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-surface-elevated cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            title={collapsed ? 'Volver a proyectos' : undefined}
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.7} />
            {!collapsed && <span>Proyectos</span>}
          </button>

          {!collapsed && (
            <button
              onClick={() => navigate(`/project/${project?.id}/tareas`)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border transition-all hover:brightness-110 cursor-pointer"
              style={{
                color: 'white',
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 95%, white 5%), #4f8cff)',
                borderColor: 'color-mix(in srgb, var(--accent-primary) 45%, transparent)',
              }}
            >
              <Plus className="w-3 h-3" strokeWidth={2.2} /> Nueva
            </button>
          )}
        </div>
      </div>

      {/* Identity block */}
      <div className="px-3 py-3 border-b" style={{ borderBottomColor: 'var(--border-subtle)' }}>
        <div
          className={`rounded-2xl border p-3 ${collapsed ? 'flex justify-center' : ''}`}
          style={{
            borderColor: 'color-mix(in srgb, var(--accent-primary) 28%, var(--border-subtle))',
            background:
              'linear-gradient(145deg, color-mix(in srgb, var(--accent-primary) 12%, transparent), color-mix(in srgb, var(--surface-muted) 88%, black))',
            boxShadow: '0 8px 26px rgba(0,0,0,0.28)',
          }}
        >
          {collapsed ? (
            <div className="relative">
              <ProgressRing value={progressValue} color={accentColor} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Code2 className="w-3.5 h-3.5" style={{ color: accentColor }} strokeWidth={1.7} />
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <ProgressRing value={progressValue} color={accentColor} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Code2
                      className="w-3.5 h-3.5"
                      style={{ color: accentColor }}
                      strokeWidth={1.7}
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <p
                    className="font-mono text-sm font-semibold truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {project?.name}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {project?.status === 'active'
                      ? 'Proyecto activo'
                      : project?.status || 'Proyecto'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <div
                  className="rounded-lg px-2 py-1.5 border"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'color-mix(in srgb, var(--surface-card) 70%, black)',
                  }}
                >
                  <p className="text-[11px] uppercase" style={{ color: 'var(--text-muted)' }}>
                    Progreso
                  </p>
                  <p className="text-xs font-mono font-semibold" style={{ color: accentColor }}>
                    {progressValue}%
                  </p>
                </div>

                <div
                  className="rounded-lg px-2 py-1.5 border"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'color-mix(in srgb, var(--surface-card) 70%, black)',
                  }}
                >
                  <p className="text-[11px] uppercase" style={{ color: 'var(--text-muted)' }}>
                    Agentes
                  </p>
                  <p
                    className="text-xs font-mono font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {activeAgentsCount}
                  </p>
                </div>

                <div
                  className="rounded-lg px-2 py-1.5 border"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'color-mix(in srgb, var(--surface-card) 70%, black)',
                  }}
                >
                  <p className="text-[11px] uppercase" style={{ color: 'var(--text-muted)' }}>
                    IA
                  </p>
                  <p
                    className="text-xs font-semibold inline-flex items-center gap-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Sparkles className="w-3 h-3" /> lista
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nav blocks */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {renderNavSection('Core', SECTION_CORE)}
        {renderNavSection('AI Ops', SECTION_AI, true)}

        <div className="space-y-1.5">
          {!collapsed && (
            <p
              className="px-1.5 text-[11px] uppercase tracking-[0.16em] font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              Infra
            </p>
          )}

          <Link
            to={`/project/${project?.id}/terminales`}
            title={collapsed ? 'Terminales & IDE' : undefined}
            aria-label={collapsed ? 'Terminales & IDE' : undefined}
            className={navCardClass(isActive('terminales'))}
            style={
              isActive('terminales')
                ? {
                    background:
                      'linear-gradient(135deg, color-mix(in srgb, #6ee7ff 15%, transparent), color-mix(in srgb, var(--surface-elevated) 92%, transparent))',
                    borderColor: 'color-mix(in srgb, #6ee7ff 35%, transparent)',
                  }
                : { background: 'var(--surface-muted)', borderColor: 'var(--border-subtle)' }
            }
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            {!collapsed && <span>Terminales & IDE</span>}
          </Link>

          {!collapsed && (
            <button
              onClick={() => navigate(`/project/${project?.id}/agenthub`)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all hover:brightness-110 cursor-pointer"
              style={{
                color: 'white',
                borderColor: 'color-mix(in srgb, var(--accent-primary) 35%, transparent)',
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 65%, transparent), color-mix(in srgb, #8b5cf6 45%, transparent))',
              }}
            >
              <Radar className="w-3.5 h-3.5" /> Quick AI Pulse
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {!collapsed && (
            <p
              className="px-1.5 text-[11px] uppercase tracking-[0.16em] font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              Settings
            </p>
          )}
          {Object.entries(configNavItems).map(([key, { icon: Icon, label }]) => {
            const active = isActive(key);
            return (
              <Link
                key={key}
                to={`/project/${project?.id}/${key}`}
                data-testid={`ws-nav-${key}`}
                title={collapsed ? label : undefined}
                aria-label={collapsed ? label : undefined}
                className={navCardClass(active)}
                style={
                  active
                    ? {
                        background:
                          'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 18%, transparent), color-mix(in srgb, var(--surface-elevated) 92%, transparent))',
                        borderColor: 'color-mix(in srgb, var(--accent-primary) 38%, transparent)',
                      }
                    : { background: 'var(--surface-muted)', borderColor: 'var(--border-subtle)' }
                }
              >
                <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
