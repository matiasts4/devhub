import { Bot, CheckCircle2, Clock, Loader2 } from "lucide-react";

const tasks = [
  { id: 1, agent: "NEXUS-7 · Desarrollador", task: "Escribiendo componentes de autenticación JWT", status: "running", module: "Auth & Security", progress: 65 },
  { id: 2, agent: "NEXUS-3 · QA", task: "Generando suite de tests para UserService", status: "running", module: "Testing", progress: 40 },
  { id: 3, agent: "NEXUS-9 · Arquitecto", task: "Diseñando esquema de base de datos MongoDB", status: "completed", module: "Database", progress: 100 },
  { id: 4, agent: "NEXUS-5 · Revisor", task: "Revisando PR #47 – Payment Module", status: "pending", module: "Backend", progress: 0 },
  { id: 5, agent: "NEXUS-2 · Documentador", task: "Generando documentación OpenAPI", status: "pending", module: "Docs", progress: 0 },
];

const statusConfig = {
  running: { color: "#58A6FF", dot: "bg-[#58A6FF] animate-pulse", label: "Ejecutando" },
  completed: { color: "#3FB950", dot: "bg-[#3FB950]", label: "Completado" },
  pending: { color: "#484F58", dot: "bg-[#484F58]", label: "Pendiente" },
};

export default function TareasActivas() {
  return (
    <div data-testid="tareas-activas" className="bg-[#161B26] border border-[#21262D] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#21262D]">
        <div className="flex items-center gap-2.5">
          <Loader2 className="w-3.5 h-3.5 text-[#58A6FF] animate-spin" strokeWidth={1.5} />
          <h3 className="font-mono text-sm font-semibold text-[#F0F6FC]">Tareas Activas de Agentes</h3>
        </div>
        <span className="text-[10px] text-[#484F58]">
          {tasks.filter(t => t.status === "running").length} en ejecución
        </span>
      </div>

      <div className="divide-y divide-[#21262D]">
        {tasks.map((task, i) => {
          const cfg = statusConfig[task.status];
          return (
            <div
              key={task.id}
              data-testid={`task-item-${task.id}`}
              className="fade-in-up flex items-center gap-4 px-5 py-3 hover:bg-[#1C2333] transition-colors"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#21262D] border border-[#30363D] flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-[#484F58]" strokeWidth={1.5} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#F0F6FC] truncate">{task.task}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[#484F58]">{task.agent}</span>
                  <span className="text-[10px] text-[#30363D]">·</span>
                  <span className="text-[10px] text-[#484F58]">{task.module}</span>
                </div>
                {task.status === "running" && (
                  <div className="mt-1.5 h-[2px] bg-[#21262D] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#388BFD]"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                <span className="text-[10px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
