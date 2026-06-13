import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FolderKanban,
  MapPin,
  Bot,
  Plug2,
  Settings,
  ChevronLeft,
  ChevronRight,
  Terminal,
} from 'lucide-react';
import { getNavItemClasses, getCollapsedWidth } from './sidebarUtils';
import { Button } from '@/components/ui/button';

const navMain = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/proyectos', icon: FolderKanban, label: 'Proyectos' },
  { path: '/roadmap', icon: MapPin, label: 'Roadmap & Fases' },
  { path: '/centro-ia', icon: Bot, label: 'Centro de IA' },
];

const navConfig = [
  { path: '/conexiones', icon: Plug2, label: 'Conexiones MCP' },
  { path: '/ajustes', icon: Settings, label: 'Ajustes locales' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar({ collapsed, onToggle }) {
  const collapsedWidth = getCollapsedWidth();

  return (
    <motion.aside
      data-testid="sidebar"
      initial={false}
      animate={{ width: collapsed ? 52 : 200 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="flex-shrink-0 bg-[#0d0d0d] border-r border-white/[0.07] flex flex-col h-full overflow-hidden"
      style={{ minWidth: collapsed ? 52 : 200 }}
    >
      {/* Logo */}
      <div
        className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'} ${
          collapsed ? 'px-0 py-3' : 'px-3 py-3'
        } border-b border-white/[0.07] h-12`}
      >
        <div
          className="h-8 w-8 flex items-center justify-center"
          style={{
            border: '1px solid color-mix(in srgb, var(--accent-primary) 60%, transparent)',
            backgroundColor: 'var(--accent-primary)',
            boxShadow: '0 0 12px -2px var(--accent-primary)',
            borderRadius: 'var(--chrome-radius-control)',
          }}
        >
          <Terminal className="w-4 h-4" style={{ color: '#000', strokeWidth: 2.25 }} />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="logo-text"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <p className="font-sans font-semibold text-white text-[13px] tracking-tight leading-tight whitespace-nowrap">
                DevHub
              </p>
              <p className="font-mono text-amber-400/70 text-[9px] tracking-[0.2em] uppercase whitespace-nowrap">
                cockpit
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto py-2.5 ${collapsed ? 'px-1.5' : 'px-2'} space-y-0.5`}>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.p
              key="nav-label"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
              className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.15em] text-slate-600 font-semibold"
            >
              Navegación
            </motion.p>
          )}
        </AnimatePresence>

        {navMain.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            data-testid={`nav-${path.slice(1)}`}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
            className={({ isActive }) => getNavItemClasses(collapsed, isActive)}
          >
            <Icon
              className="flex-shrink-0 w-4 h-4"
              strokeWidth={1.75}
            />
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  key="label"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.16, delay: 0.05, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        ))}

        <div className={`border-t border-white/[0.06] ${collapsed ? 'my-2' : 'my-2'}`} />

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.p
              key="config-label"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
              className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.15em] text-slate-600 font-semibold"
            >
              Configuración
            </motion.p>
          )}
        </AnimatePresence>

        {navConfig.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            data-testid={`nav-${path.slice(1)}`}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
            className={({ isActive }) => getNavItemClasses(collapsed, isActive)}
          >
            <Icon
              className="flex-shrink-0 w-4 h-4"
              strokeWidth={1.75}
            />
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  key="label"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.16, delay: 0.05, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06]">
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="footer-user"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
              className="flex items-center gap-2.5 px-3 py-2.5 overflow-hidden"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400/80 to-amber-600 flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0">
                DA
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-white font-medium truncate">Dev Admin</p>
                <p className="text-[10px] text-slate-500 truncate">admin@devhub.local</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <Button
          data-testid="sidebar-toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          variant="devhubGhost"
          size={collapsed ? 'icon' : 'toolbar'}
          className={`m-2 ${collapsed ? 'w-8 h-8 p-0 rounded-full' : 'w-[calc(100%-1rem)] justify-center'} border-t-0`}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] font-sans">
              <ChevronLeft className="w-3 h-3" strokeWidth={1.75} />
              <span>Colapsar</span>
            </div>
          )}
        </Button>
      </div>
    </motion.aside>
  );
}
