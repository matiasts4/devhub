import { GitCommit, GitBranch, CheckCircle2, Clock } from "lucide-react";

const commits = [
  { hash: "a3f7b2c", message: "feat: implementar autenticación JWT con refresh tokens", author: "NEXUS-7", time: "12 min", status: "success", branch: "main" },
  { hash: "9e1d4f8", message: "fix: corregir validación de formularios en checkout", author: "Dev Admin", time: "45 min", status: "success", branch: "fix/checkout" },
  { hash: "c8a2e91", message: "refactor: optimizar queries de MongoDB", author: "NEXUS-3", time: "2h", status: "success", branch: "feature/db" },
  { hash: "f5b3d7a", message: "chore: actualizar dependencias de seguridad", author: "Dev Admin", time: "3h", status: "pending", branch: "main" },
  { hash: "2d9c6e4", message: "feat: agregar componente ProductCard con skeleton", author: "NEXUS-7", time: "5h", status: "success", branch: "feature/ui" },
];

const branchColors = { main: "#3FB950", "fix/checkout": "#F778BA", "feature/db": "#58A6FF", "feature/ui": "#D2A8FF" };

export default function HistorialCommits() {
  return (
    <div data-testid="historial-commits" className="bg-[#161B26] border border-[#21262D] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#21262D]">
        <div className="flex items-center gap-2.5">
          <GitCommit className="w-3.5 h-3.5 text-[#F778BA]" strokeWidth={1.5} />
          <h3 className="font-mono text-sm font-semibold text-[#F0F6FC]">Historial de Commits</h3>
        </div>
        <span className="text-[10px] text-[#484F58]">{commits.length} recientes</span>
      </div>

      <div className="divide-y divide-[#21262D]">
        {commits.map((commit, i) => (
          <div
            key={commit.hash}
            data-testid={`commit-${commit.hash}`}
            className="fade-in-up flex items-start gap-3 px-5 py-3 hover:bg-[#1C2333] transition-colors"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="flex-shrink-0 mt-0.5">
              {commit.status === "success"
                ? <CheckCircle2 className="w-3.5 h-3.5 text-[#3FB950]" strokeWidth={1.5} />
                : <Clock className="w-3.5 h-3.5 text-[#E3B341]" strokeWidth={1.5} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#F0F6FC] truncate leading-snug">{commit.message}</p>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-[9px] font-mono text-[#484F58] bg-[#21262D] px-1.5 py-0.5 rounded border border-[#30363D]">
                  {commit.hash}
                </code>
                <span className="flex items-center gap-1 text-[9px]" style={{ color: branchColors[commit.branch] || "#8B949E" }}>
                  <GitBranch className="w-2.5 h-2.5" strokeWidth={1.5} />
                  {commit.branch}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-[10px] text-[#8B949E]">{commit.author}</p>
              <p className="text-[9px] text-[#484F58]">hace {commit.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
