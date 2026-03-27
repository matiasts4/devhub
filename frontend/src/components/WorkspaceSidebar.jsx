'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard, ListTodo, Bot, Layers, MapPin, ChevronLeft,
  ChevronRight, Settings, History, ArrowLeft, Code2, GraduationCap,
  FlaskConical, User, Building2, Plug2
} from "lucide-react";
import { projectTypes } from "../data/projects";

const typeIconMap = { Code2, GraduationCap, FlaskConical, User, Building2 };

const allNavItems = {
  dashboard: { icon: LayoutDashboard, label: "Dashboard" },
  tareas: { icon: ListTodo, label: "Tareas" },
  agentes: { icon: Bot, label: "Agentes IA" },
  scaffolding: { icon: Layers, label: "Scaffolding" },
  roadmap: { icon: MapPin, label: "Roadmap" },
  historial: { icon: History, label: "Historial" },
};

const configNavItems = {
  conexiones: { icon: Plug2, label: "Conexiones MCP" },
  ajustes: { icon: Settings, label: "Ajustes" },
};

export default function WorkspaceSidebar({ project, collapsed, onToggle }) {
  const router = useRouter();
  const pathname = usePathname();
  const tipo = projectTypes[project.tipo];
  const TypeIcon = typeIconMap[tipo?.icon] || Code2;

  const visibleNavKeys = tipo?.navItems || [];

  const isActive = (key) => pathname?.includes(`/${key}`);

  const navLinkClass = (key) =>
    `flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'} px-2.5 py-2 rounded-md text-xs font-medium transition-all ${
      isActive(key)
        ? 'bg-[#21262D] text-[#F0F6FC]'
        : 'text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#161B26]'
    }`;

  return (
    <aside
      data-testid="workspace-sidebar"
      className={`flex-shrink-0 bg-[#010409] border-r border-[#21262D] flex flex-col h-full transition-all duration-250 overflow-hidden ${
        collapsed ? "w-14" : "w-58"
      }`}
      style={{ width: collapsed ? "56px" : "228px" }}
    >
      {/* Back to Hub */}
      <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2"} px-3 py-3 border-b border-[#21262D] h-12`}>
        <button
          data-testid="back-to-hub"
          onClick={() => router.push('/hub')}
          className="flex items-center gap-2 text-[#8B949E] hover:text-[#F0F6FC] transition-colors text-xs"
          title={collapsed ? "Volver a proyectos" : undefined}
        >
          <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Proyectos</span>}
        </button>
      </div>

      {/* Project identity */}
      {!collapsed && (
        <div className="px-3 py-3 border-b border-[#21262D]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: `${tipo?.color}18`, border: `1px solid ${tipo?.color}28` }}
            >
              <TypeIcon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: tipo?.color }} />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold text-[#F0F6FC] truncate leading-tight">{project.nombre}</p>
              <p className="text-[9px] font-medium truncate" style={{ color: tipo?.color }}>{tipo?.label}</p>
            </div>
          </div>
        </div>
      )}
      {collapsed && (
        <div className="flex justify-center py-3 border-b border-[#21262D]">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: `${tipo?.color}18`, border: `1px solid ${tipo?.color}28` }}
            title={project.nombre}
          >
            <TypeIcon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: tipo?.color }} />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {!collapsed && (
          <p className="px-2.5 pt-1 pb-1.5 text-[9px] uppercase tracking-[0.15em] text-[#484F58] font-semibold">
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
              href={`/project/${project.id}/${key}`}
              data-testid={`ws-nav-${key}`}
              title={collapsed ? label : undefined}
              className={navLinkClass(key)}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}

        {/* Config section */}
        <div className={`${collapsed ? "my-2" : "my-2"} border-t border-[#21262D]`} />
        {!collapsed && (
          <p className="px-2.5 pt-0.5 pb-1.5 text-[9px] uppercase tracking-[0.15em] text-[#484F58] font-semibold">
            Configuración
          </p>
        )}
        {Object.entries(configNavItems).map(([key, { icon: Icon, label }]) => (
          <Link
            key={key}
            href={`/project/${project.id}/${key}`}
            data-testid={`ws-nav-${key}`}
            title={collapsed ? label : undefined}
            className={navLinkClass(key)}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
            {!collapsed && <span>{label}</span>}
          </Link>
        ))}
      </nav>

      {/* Sections quick view */}
      {!collapsed && (
        <div className="px-3 pb-3 border-t border-[#21262D] pt-3">
          <p className="text-[9px] uppercase tracking-[0.15em] text-[#484F58] mb-2 font-semibold px-1">Secciones</p>
          <div className="space-y-1.5">
            {project.secciones.map((sec) => (
              <div key={sec.nombre} className="flex items-center gap-2 px-1">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sec.color }} />
                <span className="text-[10px] text-[#8B949E] truncate flex-1">{sec.nombre}</span>
                <span className="text-[9px] font-mono" style={{ color: sec.color }}>{sec.progreso}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toggle */}
      <button
        data-testid="sidebar-toggle"
        onClick={onToggle}
        className="flex items-center justify-center py-2.5 border-t border-[#21262D] text-[#484F58] hover:text-[#8B949E] hover:bg-[#161B26] transition-all"
      >
        {collapsed
          ? <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
          : <div className="flex items-center gap-1.5 text-[10px]">
              <ChevronLeft className="w-3 h-3" strokeWidth={1.5} />
              <span>Colapsar</span>
            </div>
        }
      </button>
    </aside>
  );
}
