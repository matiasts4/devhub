import { GitCommit, GitBranch, CheckCircle2, Clock } from "lucide-react";

const commits = [
  { hash: "a3f7b2c", message: "feat: implementar autenticación JWT con refresh tokens", author: "NEXUS-7", time: "12 min", status: "success", branch: "main" },
  { hash: "9e1d4f8", message: "fix: corregir validación de formularios en checkout", author: "Dev Admin", time: "45 min", status: "success", branch: "fix/checkout" },
  { hash: "c8a2e91", message: "refactor: optimizar queries de MongoDB con índices", author: "NEXUS-3", time: "2h", status: "success", branch: "feature/db" },
  { hash: "f5b3d7a", message: "chore: actualizar dependencias de seguridad npm", author: "Dev Admin", time: "3h", status: "pending", branch: "main" },
  { hash: "2d9c6e4", message: "feat: agregar componente ProductCard con skeleton", author: "NEXUS-7", time: "5h", status: "success", branch: "feature/ui" },
];

const branchColors = {
  main: "text-[#39FF14]",
  "fix/checkout": "text-[#FF007F]",
  "feature/db": "text-[#00F0FF]",
  "feature/ui": "text-[#00F0FF]",
};

export default function HistorialCommits() {
  return (
    <div
      data-testid="historial-commits"
      className="bg-[#111827]/60 border border-white/8 rounded-xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <GitCommit className="w-4 h-4 text-[#FF007F]" strokeWidth={1.5} />
          <h3 className="font-mono text-sm font-semibold text-white">Historial de Commits</h3>
        </div>
        <span className="text-[10px] text-slate-500">{commits.length} recientes</span>
      </div>

      <div className="divide-y divide-white/5">
        {commits.map((commit, i) => (
          <div
            key={commit.hash}
            data-testid={`commit-${commit.hash}`}
            className="fade-in-up flex items-start gap-3 px-5 py-3 hover:bg-white/3 transition-colors group"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex-shrink-0 mt-0.5">
              {commit.status === "success" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#39FF14]" strokeWidth={1.5} />
              ) : (
                <Clock className="w-3.5 h-3.5 text-[#FFE600]" strokeWidth={1.5} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs text-white truncate leading-snug">{commit.message}</p>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-[10px] font-mono text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">
                  {commit.hash}
                </code>
                <span className={`flex items-center gap-1 text-[10px] ${branchColors[commit.branch] || "text-slate-400"}`}>
                  <GitBranch className="w-2.5 h-2.5" strokeWidth={1.5} />
                  {commit.branch}
                </span>
              </div>
            </div>

            <div className="flex-shrink-0 text-right">
              <p className="text-[10px] text-slate-400">{commit.author}</p>
              <p className="text-[10px] text-slate-600">hace {commit.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
