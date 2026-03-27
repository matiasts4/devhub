import { Bot, CheckCircle2, Clock, Loader2 } from "lucide-react";

const tasks = [
  { id: 1, agent: "NEXUS-7 · Desarrollador", task: "Escribiendo componentes de autenticación JWT", status: "running", module: "Auth & Security", progress: 65 },
  { id: 2, agent: "NEXUS-3 · QA", task: "Generando suite de tests para UserService", status: "running", module: "Testing", progress: 40 },
  { id: 3, agent: "NEXUS-9 · Arquitecto", task: "Diseñando esquema de base de datos MongoDB", status: "completed", module: "Database", progress: 100 },
  { id: 4, agent: "NEXUS-5 · Revisor", task: "Revisando PR #47 – Payment Module", status: "pending", module: "Backend", progress: 0 },
  { id: 5, agent: "NEXUS-2 · Documentador", task: "Generando documentación OpenAPI", status: "pending", module: "Docs", progress: 0 },
];

const statusConfig = {
  running: { color: "text-[#00F0FF]", dot: "bg-[#00F0FF] animate-pulse", label: "Ejecutando" },
  completed: { color: "text-[#39FF14]", dot: "bg-[#39FF14]", label: "Completado" },
  pending: { color: "text-[#FFE600]", dot: "bg-[#FFE600]/60", label: "Pendiente" },
};

export default function TareasActivas() {
  return (
    <div
      data-testid="tareas-activas"
      className="bg-[#111827]/60 border border-white/8 rounded-xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <Loader2 className="w-4 h-4 text-[#00F0FF] animate-spin" strokeWidth={1.5} />
          <h3 className="font-mono text-sm font-semibold text-white">Tareas Activas</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] animate-pulse" />
          <span className="text-[10px] text-slate-400">{tasks.filter(t => t.status === "running").length} en ejecución</span>
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {tasks.map((task, i) => {
          const cfg = statusConfig[task.status];
          return (
            <div
              key={task.id}
              data-testid={`task-item-${task.id}`}
              className="fade-in-up flex items-center gap-4 px-5 py-3 hover:bg-white/3 transition-colors"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{task.task}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-slate-500">{task.agent}</span>
                  <span className="text-[10px] text-slate-600">·</span>
                  <span className="text-[10px] text-slate-500">{task.module}</span>
                </div>
                {task.status === "running" && (
                  <div className="mt-1.5 h-0.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#00F0FF]/60 to-[#00F0FF]"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
