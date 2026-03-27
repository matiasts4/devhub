import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ListTodo, Plus, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const columns = [
  { id: "pendiente", label: "Pendiente", color: "#484F58", border: "#30363D" },
  { id: "en-progreso", label: "En progreso", color: "#58A6FF", border: "#388BFD33" },
  { id: "revision", label: "En revisión", color: "#E3B341", border: "#BB800933" },
  { id: "completado", label: "Completado", color: "#3FB950", border: "#238636" + "33" },
];

const prioridadConfig = {
  critica: { label: "Crítica", color: "#F778BA" },
  alta: { label: "Alta", color: "#FFA657" },
  media: { label: "Media", color: "#E3B341" },
  baja: { label: "Baja", color: "#8B949E" },
};

const teamColors = { "Dev Admin": "#58A6FF", "NEXUS-7": "#3FB950", "NEXUS-3": "#F778BA", "NEXUS-9": "#D2A8FF" };

export default function Tareas() {
  const { project } = useOutletContext();
  const [tasks, setTasks] = useState(project.tareasKanban || []);

  const moveTask = (taskId, targetColumn) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, estado: targetColumn } : t))
    );
    toast.success("Tarea movida", { description: `Movida a "${columns.find(c => c.id === targetColumn)?.label}"` });
  };

  return (
    <div className="min-h-screen bg-[#0D1117]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0D1117]/95 backdrop-blur-sm border-b border-[#21262D] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListTodo className="w-4 h-4 text-[#58A6FF]" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-[#F0F6FC]">Tareas</h1>
          <span className="text-[10px] text-[#484F58] bg-[#21262D] px-2 py-0.5 rounded-full border border-[#30363D]">
            {tasks.length} total
          </span>
        </div>
        <button
          data-testid="add-task-btn"
          onClick={() => toast.info("Creando nueva tarea con asistencia de IA...")}
          className="flex items-center gap-2 bg-[#238636] text-white font-medium px-3 py-1.5 rounded-lg text-xs hover:bg-[#2EA043] transition-colors active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          Añadir Tarea
        </button>
      </div>

      {/* Kanban */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {columns.map((col) => {
            const colTasks = tasks.filter((t) => t.estado === col.id);
            return (
              <div
                key={col.id}
                data-testid={`kanban-col-${col.id}`}
                className="bg-[#161B26] border border-[#21262D] rounded-xl overflow-hidden"
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#21262D]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <span className="text-xs font-semibold" style={{ color: col.color }}>{col.label}</span>
                  </div>
                  <span className="font-mono text-xs text-[#484F58] bg-[#21262D] w-5 h-5 rounded flex items-center justify-center">
                    {colTasks.length}
                  </span>
                </div>

                {/* Tasks */}
                <div className="p-3 space-y-2 min-h-[120px]">
                  {colTasks.map((task, i) => {
                    const prio = prioridadConfig[task.prioridad];
                    const assigneeColor = teamColors[task.asignado] || "#8B949E";
                    const nextCols = columns.filter((c) => c.id !== col.id);
                    return (
                      <div
                        key={task.id}
                        data-testid={`task-card-${task.id}`}
                        className="fade-in-up bg-[#0D1117] border border-[#21262D] rounded-lg p-3 hover:border-[#30363D] transition-all group"
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        <p className="text-xs text-[#F0F6FC] font-medium leading-snug mb-2">{task.titulo}</p>
                        <div className="flex flex-wrap gap-1 mb-2.5">
                          {task.etiquetas.map((tag) => (
                            <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-[#21262D] text-[#8B949E] rounded font-medium border border-[#30363D]">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                              style={{ background: assigneeColor + "CC" }}
                              title={task.asignado}
                            >
                              {task.asignado.slice(0, 2)}
                            </div>
                            <span className="text-[9px] font-medium" style={{ color: prio.color }}>{prio.label}</span>
                          </div>
                          {/* Move dropdown (simple) */}
                          <div className="relative group/move">
                            <button className="opacity-0 group-hover:opacity-100 text-[#484F58] hover:text-[#8B949E] transition-all">
                              <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                            <div className="absolute right-0 bottom-6 bg-[#161B26] border border-[#21262D] rounded-lg py-1 hidden group-hover/move:block z-10 min-w-[120px] shadow-lg">
                              {nextCols.map((nc) => (
                                <button
                                  key={nc.id}
                                  onClick={() => moveTask(task.id, nc.id)}
                                  className="w-full text-left px-3 py-1.5 text-[10px] text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D] transition-colors flex items-center gap-2"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: nc.color }} />
                                  {nc.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add button */}
                  <button
                    data-testid={`add-to-${col.id}`}
                    onClick={() => toast.info(`Añadiendo tarea en "${col.label}"...`)}
                    className="w-full py-2 text-[10px] text-[#484F58] hover:text-[#8B949E] hover:bg-[#21262D] rounded-lg transition-all flex items-center justify-center gap-1 border border-dashed border-[#21262D] hover:border-[#30363D]"
                  >
                    <Plus className="w-3 h-3" strokeWidth={1.5} />
                    Añadir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
