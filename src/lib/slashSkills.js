/**
 * Slash command definitions for AgentHub chat.
 * Includes SDD phases, MCP tools, and installed skills.
 *
 * Icon names reference lucide-react components (mapped in AgentHub.jsx).
 */

export const slashCommands = [
  // ─── SDD Commands ───
  {
    cmd: '/sdd-explore',
    label: 'Explorar código',
    description: 'Investiga el codebase, compara enfoques y analiza ideas antes de implementar',
    category: 'SDD',
    color: 'text-indigo-400',
    icon: 'Search',
  },
  {
    cmd: '/sdd-propose',
    label: 'Proponer cambio',
    description: 'Crea una propuesta de cambio con intención, alcance y enfoque técnico',
    category: 'SDD',
    color: 'text-blue-400',
    icon: 'FileText',
  },
  {
    cmd: '/sdd-spec',
    label: 'Escribir especificaciones',
    description: 'Define requisitos detallados y escenarios de aceptación para un cambio',
    category: 'SDD',
    color: 'text-teal-400',
    icon: 'ListChecks',
  },
  {
    cmd: '/sdd-design',
    label: 'Diseño técnico',
    description:
      'Crea el diseño técnico con decisiones de arquitectura y estructura de componentes',
    category: 'SDD',
    color: 'text-emerald-400',
    icon: 'PenTool',
  },
  {
    cmd: '/sdd-tasks',
    label: 'Desglose de tareas',
    description: 'Divide una especificación en un checklist de tareas atómicas e implementables',
    category: 'SDD',
    color: 'text-yellow-400',
    icon: 'CheckSquare',
  },
  {
    cmd: '/sdd-apply',
    label: 'Aplicar y codificar',
    description: 'Implementa las tareas del checklist escribiendo código real siguiendo las specs',
    category: 'SDD',
    color: 'text-orange-400',
    icon: 'Code',
  },
  {
    cmd: '/sdd-verify',
    label: 'Validar cambios',
    description: 'Verifica que la implementación coincide con las specs, design y tareas',
    category: 'SDD',
    color: 'text-rose-400',
    icon: 'ShieldCheck',
  },
  {
    cmd: '/sdd-archive',
    label: 'Archivar y cerrar',
    description: 'Cierra un cambio completado y sincroniza specs delta con las specs principales',
    category: 'SDD',
    color: 'text-slate-400',
    icon: 'Archive',
  },

  // ─── MCP Tools ───
  {
    cmd: '/engram',
    label: 'Memoria persistente',
    description: 'Invoca el MCP de Engram para buscar, guardar o actualizar memorias del proyecto',
    category: 'MCP',
    color: 'text-[#5b8cff]',
    icon: 'Brain',
  },

  // ─── Skills ───
  {
    cmd: '/branch-pr',
    label: 'Crear Pull Request',
    description: 'Crea un PR siguiendo el sistema issue-first con resumen y checklist',
    category: 'Skills',
    color: 'text-purple-400',
    icon: 'GitPullRequest',
  },
  {
    cmd: '/issue-creation',
    label: 'Crear Issue',
    description:
      'Reporta un bug o solicita una feature siguiendo el formato de issues del proyecto',
    category: 'Skills',
    color: 'text-pink-400',
    icon: 'Bug',
  },
  {
    cmd: '/judgment-day',
    label: 'Revisión adversarial',
    description: 'Lanza dos jueces independientes para revisar código y sintetizar hallazgos',
    category: 'Skills',
    color: 'text-red-400',
    icon: 'Scale',
  },
  {
    cmd: '/go-testing',
    label: 'Tests en Go',
    description: 'Patrones de testing para Go, incluyendo Bubbletea TUI testing con teatest',
    category: 'Skills',
    color: 'text-cyan-400',
    icon: 'TestTube',
  },
  {
    cmd: '/skill-creator',
    label: 'Crear nueva skill',
    description:
      'Crea una nueva skill de IA siguiendo el formato Agent Skills con instrucciones y workflows',
    category: 'Skills',
    color: 'text-lime-400',
    icon: 'Wrench',
  },

  // ─── UX / UI ───
  {
    cmd: '/ui-ux-pro-max',
    label: 'UI/UX Design Intelligence',
    description:
      '50+ estilos, paletas, font pairings, 9 stacks (React, Next.js, Vue, Tailwind, shadcn/ui)',
    category: 'UX/UI',
    color: 'text-violet-400',
    icon: 'Palette',
  },
  {
    cmd: '/react-best-practices',
    label: 'React Best Practices',
    description:
      '40+ reglas de optimización: waterfalls, bundle size, rendering, Server Components',
    category: 'UX/UI',
    color: 'text-sky-400',
    icon: 'Zap',
  },
  {
    cmd: '/senior-frontend',
    label: 'Senior Frontend',
    description:
      'React, Next.js, TypeScript, Tailwind — scaffolding, performance, UI best practices',
    category: 'UX/UI',
    color: 'text-fuchsia-400',
    icon: 'Monitor',
  },
];

/**
 * Filter commands by search query
 */
export function filterSlashCommands(query) {
  if (!query) return slashCommands;
  const q = query.toLowerCase();
  return slashCommands.filter(
    (s) =>
      s.cmd.toLowerCase().includes(q) ||
      s.label.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
  );
}

/**
 * Group commands by category
 */
export function groupByCategory(commands) {
  const groups = {};
  commands.forEach((cmd) => {
    if (!groups[cmd.category]) {
      groups[cmd.category] = [];
    }
    groups[cmd.category].push(cmd);
  });
  return groups;
}
