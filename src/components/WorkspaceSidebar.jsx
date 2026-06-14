/* eslint-disable no-unused-vars */
'use client';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ListTodo,
  Layers,
  MapPin,
  Settings,
  History,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plug2,
  FolderOpen,
  Terminal,
  Send,
  Cpu,
  Plus,
  Sparkles,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import { useAuth } from '@/lib/auth/AuthContext';
import StatusSignal from '@/components/ui/StatusSignal';
import {
  getVisibleNavKeys,
  getSidebarChromeStyle,
  getSidebarNavActiveStyle,
  getSidebarNavItemClasses,
  getSidebarIdentityShellStyle,
  getSidebarStatCardStyle,
  getSidebarToggleStyle,
  isAgentActive,
  shouldShowPlanningSignal,
} from './workspaceSidebarUtils';
import { Button } from '@/components/ui/button';

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
  planificacion: { icon: Sparkles, label: 'Planificación' },
  tareas: { icon: ListTodo, label: 'Tareas' },
  editor: { icon: FolderOpen, label: 'Sistema de Archivos' },
  scaffolding: { icon: Layers, label: 'Scaffolding' },
  roadmap: { icon: MapPin, label: 'Roadmap' },
  historial: { icon: History, label: 'Historial' },
  swarm: { icon: Cpu, label: 'Swarm Control' },
  telegram: { icon: Send, label: 'Telegram Bot' },
};

const configNavItems = {
  conexiones: { icon: Plug2, label: 'Conexiones MCP' },
  settings: { icon: Settings, label: 'Ajustes' },
};

const DEFAULT_NAV = [
  'dashboard',
  'planificacion',
  'tareas',
  'editor',
  'roadmap',
  'historial',
  'swarm',
  'telegram',
];

const SECTION_CORE = ['dashboard', 'planificacion', 'tareas', 'editor', 'roadmap', 'historial'];
const SECTION_AI = ['swarm', 'telegram'];

// Transition used consistently for slide/fade in collapsed ↔ expanded
const SLIDE_TRANSITION = { duration: 0.18, ease: [0.4, 0, 0.2, 1] };

function ProgressRing({ value, color = 'oklch(0.74 0.16 57)' }) {
  const radius = 16;
  const stroke = 2.5;
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
          transition: 'stroke-dashoffset 0.4s ease',
          filter: `drop-shadow(0 0 4px ${color}55)`,
        }}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
        transform={`rotate(-90 ${radius} ${radius})`}
      />
    </svg>
  );
}

export default function WorkspaceSidebar({
  project,
  collapsed,
  isTerminalOpen,
  onToggleCollapse,
  className,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const { user } = useAuth();

  const [activeAgentsCount, setActiveAgentsCount] = useState(0);

  useEffect(() => {
    if (!project?.id) return;
    const db = createClient();

    const fetchAgents = async () => {
      const nowMs = Date.now();
      const { data } = await db
        .from('agent_registry')
        .select('agent_id, status, last_heartbeat, updated_at, created_at')
        .eq('project_id', project.id)
        .in('status', Array.from(ACTIVE_AGENT_STATUSES));

      const count = (data || []).filter((a) =>
        isAgentActive(a, nowMs, HEARTBEAT_FRESH_MS, ACTIVE_AGENT_STATUSES)
      ).length;

      setActiveAgentsCount(count);
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

  const accentColor = project?.color || 'oklch(0.74 0.16 57)';
  const progressValue = Number.isFinite(Number(project?.progress))
    ? Math.max(0, Math.min(100, Number(project.progress)))
    : 0;

  const visibleNavKeys = getVisibleNavKeys(project?.features, DEFAULT_NAV);

  const isActive = (key) => pathname?.includes(`/${key}`);

  const navItemCls = (active) => getSidebarNavItemClasses({ active, collapsed });

  const renderSectionLabel = (title, extra = null) => (
    <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.div
          className="px-1.5 flex items-center justify-between"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={SLIDE_TRANSITION}
        >
          <p className="typography-section-label">{title}</p>
          {extra}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderNavItem = (key, item, activeStyle = null) => {
    const { icon: Icon, label } = item;
    const active = isActive(key) || (key === 'terminales' && isTerminalOpen);

    const activeInlineStyle = active
      ? activeStyle || getSidebarNavActiveStyle()
      : { background: 'transparent', borderColor: 'transparent', boxShadow: 'none' };

    const href =
      key === 'settings'
        ? `/project/${project?.id}/settings/appearance`
        : `/project/${project?.id}/${key}`;

    return (
      <Link
        key={key}
        to={href}
        data-testid={`ws-nav-${key}`}
        title={collapsed ? label : undefined}
        aria-label={collapsed ? label : undefined}
        aria-current={active ? 'page' : undefined}
        className={navItemCls(active)}
        style={activeInlineStyle}
      >
        <div className="relative shrink-0">
          <Icon className="w-3.5 h-3.5" strokeWidth={1.7} />
          {shouldShowPlanningSignal(key, project?.planning_status) && (
            <span className="absolute -top-1 -right-1">
              <StatusSignal tone="warning" animation="none" compact />
            </span>
          )}
          {key === 'swarm' &&
            !shouldShowPlanningSignal(key, project?.planning_status) &&
            activeAgentsCount > 0 && (
              <span className="absolute -top-1 -right-1">
                <StatusSignal tone="success" animation="pulse" compact />
              </span>
            )}
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              className="truncate"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ ...SLIDE_TRANSITION, delay: 0.06 }}
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    );
  };

  const renderNavSection = (title, keys, withSignals = false) => {
    const filtered = keys.filter((key) => visibleNavKeys.includes(key));
    if (filtered.length === 0) return null;

    return (
      <div className="space-y-1">
        {renderSectionLabel(
          title,
          withSignals ? (
            <StatusSignal
              tone={activeAgentsCount > 0 ? 'success' : 'neutral'}
              animation={activeAgentsCount > 0 ? 'pulse' : 'none'}
              compact
            />
          ) : null
        )}
        {filtered.map((key) => {
          const item = allNavItems[key];
          if (!item) return null;
          return renderNavItem(key, item);
        })}
      </div>
    );
  };

  return (
    <motion.aside
      data-testid="workspace-sidebar"
      initial={false}
      animate={{ width: collapsed ? 48 : 256 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className={`relative flex-shrink-0 border-r h-full ${className || ''}`}
      style={{
        ...getSidebarChromeStyle(),
        minWidth: collapsed ? 48 : 256,
      }}
    >
      <div className="flex flex-col w-full h-full overflow-hidden">
        {/* Top strip */}
        <div
          className="px-2.5 py-2.5 border-b"
          style={{
            borderBottomColor: 'var(--border-subtle)',
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 7%, transparent), transparent 55%)',
          }}
        >
          <div
            className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-2`}
          >
            <Button
              data-testid="back-to-hub"
              onClick={() => navigate('/hub')}
              aria-label="Volver a proyectos"
              variant="devhubGhost"
              size="toolbar"
              className="px-2.5"
              title={collapsed ? 'Volver a proyectos' : undefined}
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" strokeWidth={1.7} />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ ...SLIDE_TRANSITION, delay: 0.12 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    Proyectos
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>

            <AnimatePresence initial={false}>
              {!collapsed && (
                <Button
                  onClick={() => navigate(`/project/${project?.id}/tareas`)}
                  variant="devhubPrimary"
                  size="toolbar"
                >
                  <Plus className="w-3 h-3" strokeWidth={2.2} /> Nueva
                </Button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Nav blocks */}
        <nav
          className={`flex-1 overflow-y-auto ${collapsed ? 'px-1.5' : 'px-2.5'} py-2.5 space-y-3`}
        >
          {renderNavSection('Core', SECTION_CORE)}
          {renderNavSection('AI Ops', SECTION_AI, true)}

          <div className="space-y-1">
            {renderSectionLabel('Infra')}
            {renderNavItem(
              'terminales',
              { icon: Terminal, label: 'Terminales & IDE' },
              {
                ...getSidebarNavActiveStyle(),
              }
            )}
          </div>

          <div className="space-y-1">
            {renderSectionLabel('Settings')}
            {Object.entries(configNavItems).map(([key, item]) => renderNavItem(key, item))}
          </div>
        </nav>

        {/* Identity block - moved to bottom */}
        <div className="px-2.5 py-2.5 border-t" style={{ borderTopColor: 'var(--border-subtle)' }}>
          <motion.div
            layout
            className={collapsed ? 'flex justify-center' : 'rounded-none border p-2.5'}
            style={
              collapsed
                ? {}
                : {
                    ...getSidebarIdentityShellStyle(),
                    borderRadius: 0,
                    boxShadow: '2px 2px 0 0 var(--border-strong)',
                  }
            }
          >
            {collapsed ? (
              <div className="relative" title={project?.name}>
                <ProgressRing value={progressValue} color={accentColor} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="h-9 w-9 border-2 flex items-center justify-center"
                    style={{
                      borderColor: 'var(--accent-primary)',
                      backgroundColor: 'var(--accent-primary)',
                      boxShadow: '2px 2px 0 0 var(--accent-shadow)',
                      borderRadius: 0,
                    }}
                  >
                    <Terminal className="w-5 h-5" style={{ color: '#000', strokeWidth: 2.5 }} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative shrink-0">
                    <ProgressRing value={progressValue} color={accentColor} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="h-9 w-9 border-2 flex items-center justify-center"
                        style={{
                          borderColor: 'var(--accent-primary)',
                          backgroundColor: 'var(--accent-primary)',
                          boxShadow: '2px 2px 0 0 var(--accent-shadow)',
                          borderRadius: 0,
                        }}
                      >
                        <Terminal className="w-5 h-5" style={{ color: '#000', strokeWidth: 2.5 }} />
                      </div>
                    </div>
                  </div>

                  <motion.div
                    className="min-w-0"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...SLIDE_TRANSITION, delay: 0.08 }}
                  >
                    <p
                      className="typography-label truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {project?.name}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {project?.status === 'active'
                        ? 'Proyecto activo'
                        : project?.status || 'Proyecto'}
                    </p>
                  </motion.div>
                </div>

                <motion.div
                  className="grid grid-cols-3 gap-1"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SLIDE_TRANSITION, delay: 0.14 }}
                >
                  {[
                    { label: 'Progreso', value: `${progressValue}%`, valueColor: accentColor },
                    {
                      label: 'Agentes',
                      value: activeAgentsCount,
                      valueColor: 'var(--text-primary)',
                    },
                    {
                      label: 'IA',
                      value: (
                        <span className="inline-flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" /> lista
                        </span>
                      ),
                      valueColor: 'var(--text-primary)',
                    },
                  ].map(({ label, value, valueColor }) => (
                    <div
                      key={label}
                      className="rounded-none px-1.5 py-1 border"
                      style={getSidebarStatCardStyle()}
                    >
                      <p className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
                        {label}
                      </p>
                      <p
                        className="text-[11px] font-mono font-semibold"
                        style={{ color: valueColor }}
                      >
                        {value}
                      </p>
                    </div>
                  ))}
                </motion.div>
              </div>
            )}
          </motion.div>
        </div>

        {/* Bottom bar: user indicator + collapse toggle */}
        <div className="border-t" style={{ borderTopColor: 'var(--border-subtle)' }}>
          {/* User row — only visible when logged in */}
          {user && (
            <div
              className={`flex items-center min-w-0 ${
                collapsed ? 'justify-center px-1.5 py-2' : 'gap-2 px-2.5 py-2'
              }`}
            >
              {/* Avatar */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{
                  background: 'var(--accent-primary)',
                  boxShadow: '0 0 0 1px color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                }}
                title={user.email}
              >
                {user.email[0].toUpperCase()}
              </div>

              {/* Info - only when expanded */}
              {!collapsed && (
                <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                  <span
                    className="text-[11px] font-medium truncate"
                    style={{ color: 'var(--text-primary)', lineHeight: '1.3' }}
                  >
                    {user.email.split('@')[0]}
                  </span>
                  <span
                    className="text-[9px] flex items-center gap-1 truncate"
                    style={{ color: 'var(--accent-primary)', lineHeight: '1.2' }}
                  >
                    <Cloud className="w-2.5 h-2.5 shrink-0" />
                    Cloud Sync
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Collapse toggle */}
          <button
            data-testid="sidebar-toggle-bottom"
            onClick={() => onToggleCollapse && onToggleCollapse(!collapsed)}
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            title={collapsed ? 'Expandir' : 'Colapsar'}
            className={`w-full flex items-center justify-center transition-all cursor-pointer border-t ${
              collapsed ? 'py-1.5' : 'gap-1.5 px-2 py-1.5'
            } text-[10px] font-medium`}
            style={{
              background: 'var(--chrome-control-fill)',
              borderColor: 'var(--chrome-border-color)',
              color: 'var(--text-muted)',
            }}
          >
            <ChevronRight
              className="w-3 h-3 transition-transform duration-200"
              strokeWidth={1.8}
              style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
            />
            {!collapsed && <span>Colapsar</span>}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
