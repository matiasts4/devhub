import { Terminal, Eye, Rocket, Sparkles, AlertCircle, ArrowRight } from "lucide-react";

const interactions = [
  { id: 1, type: "comando", user: "Dev Admin", action: "Generó módulo de autenticación", target: "AuthService.js", time: "5 min", icon: Terminal, iconColor: "text-[#00F0FF]", iconBg: "bg-[#00F0FF]/10 border-[#00F0FF]/20" },
  { id: 2, type: "revision", user: "NEXUS-7", action: "Revisó 3 componentes UI", target: "UI Components", time: "18 min", icon: Eye, iconColor: "text-[#39FF14]", iconBg: "bg-[#39FF14]/10 border-[#39FF14]/20" },
  { id: 3, type: "deploy", user: "Pipeline CI/CD", action: "Build exitoso · v0.4.2-beta", target: "Production", time: "32 min", icon: Rocket, iconColor: "text-[#FF007F]", iconBg: "bg-[#FF007F]/10 border-[#FF007F]/20" },
  { id: 4, type: "sugerencia", user: "NEXUS-3", action: "Sugirió refactoring crítico", target: "PaymentController", time: "1h", icon: Sparkles, iconColor: "text-[#FFE600]", iconBg: "bg-[#FFE600]/10 border-[#FFE600]/20" },
  { id: 5, type: "error", user: "Sistema", action: "Error detectado y registrado", target: "UserSession.js", time: "2h", icon: AlertCircle, iconColor: "text-[#FF007F]", iconBg: "bg-[#FF007F]/10 border-[#FF007F]/20" },
];

export default function UltimasInteracciones() {
  return (
    <div
      data-testid="ultimas-interacciones"
      className="bg-[#111827]/60 border border-white/8 rounded-xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <ArrowRight className="w-4 h-4 text-[#FFE600]" strokeWidth={1.5} />
          <h3 className="font-mono text-sm font-semibold text-white">Últimas Interacciones</h3>
        </div>
        <span className="text-[10px] text-slate-500">Hoy</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-5 py-2 text-[9px] uppercase tracking-[0.15em] text-slate-600 font-semibold">Tipo</th>
              <th className="text-left px-3 py-2 text-[9px] uppercase tracking-[0.15em] text-slate-600 font-semibold">Acción</th>
              <th className="text-left px-3 py-2 text-[9px] uppercase tracking-[0.15em] text-slate-600 font-semibold">Destino</th>
              <th className="text-left px-3 py-2 text-[9px] uppercase tracking-[0.15em] text-slate-600 font-semibold">Agente</th>
              <th className="text-right px-5 py-2 text-[9px] uppercase tracking-[0.15em] text-slate-600 font-semibold">Tiempo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {interactions.map((item, i) => {
              const Icon = item.icon;
              return (
                <tr
                  key={item.id}
                  data-testid={`interaction-${item.id}`}
                  className="fade-in-up hover:bg-white/3 transition-colors"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <td className="px-5 py-2.5">
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center border ${item.iconBg}`}
                    >
                      <Icon className={`w-3 h-3 ${item.iconColor}`} strokeWidth={1.5} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-xs text-white">{item.action}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <code className="text-[10px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">
                      {item.target}
                    </code>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-slate-400">{item.user}</span>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <span className="text-[10px] text-slate-500">hace {item.time}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
