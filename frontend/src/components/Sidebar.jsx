import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, FolderKanban, Layers, MapPin, Bot,
  Plug2, Settings, ChevronLeft, ChevronRight, Cpu,
} from "lucide-react";

const navMain = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/proyectos", icon: FolderKanban, label: "Proyectos" },
  { path: "/scaffolding", icon: Layers, label: "Scaffolding & Stack" },
  { path: "/roadmap", icon: MapPin, label: "Roadmap & Fases" },
  { path: "/centro-ia", icon: Bot, label: "Centro de IA" },
];

const navConfig = [
  { path: "/conexiones", icon: Plug2, label: "Conexiones MCP" },
  { path: "/ajustes", icon: Settings, label: "Ajustes locales" },
];

export default function Sidebar({ collapsed, onToggle }) {
  return (
    <aside
      data-testid="sidebar"
      className={`flex-shrink-0 bg-[#070A10] border-r border-white/10 flex flex-col h-full transition-all duration-300 overflow-hidden ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div
        className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-4 py-4 border-b border-white/10 h-16`}
      >
        <div className="w-8 h-8 rounded-lg bg-[#00F0FF]/15 border border-[#00F0FF]/30 flex items-center justify-center flex-shrink-0">
          <Cpu className="w-4 h-4 text-[#00F0FF]" strokeWidth={1.5} />
        </div>
        {!collapsed && (
          <div>
            <p className="font-mono font-bold text-white text-sm tracking-wider leading-tight">
              DevNexus
            </p>
            <p className="font-mono text-[#00F0FF] text-[10px] tracking-[0.25em] uppercase">
              AI v2.0
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {!collapsed && (
          <p className="px-3 mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-600 font-semibold">
            Navegación
          </p>
        )}
        {navMain.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            data-testid={`nav-${path.slice(1)}`}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center ${
                collapsed ? "justify-center" : "gap-3"
              } px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/25"
                  : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}

        <div className="my-3 border-t border-white/10" />

        {!collapsed && (
          <p className="px-3 mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-600 font-semibold">
            Configuración
          </p>
        )}
        {navConfig.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            data-testid={`nav-${path.slice(1)}`}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center ${
                collapsed ? "justify-center" : "gap-3"
              } px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/25"
                  : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00F0FF] to-[#FF007F] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
              DA
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white font-medium truncate">Dev Admin</p>
              <p className="text-[10px] text-slate-500 truncate">admin@devnexus.ai</p>
            </div>
          </div>
        )}
        <button
          data-testid="sidebar-toggle"
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2.5 text-slate-500 hover:text-[#00F0FF] hover:bg-white/5 transition-all duration-200 border-t border-white/5"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
          ) : (
            <div className="flex items-center gap-1.5 text-xs">
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>Colapsar</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
