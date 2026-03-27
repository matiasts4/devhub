import { Terminal, Eye, Rocket, Sparkles, AlertCircle } from "lucide-react";

const interactions = [
  { id: 1, user: "Dev Admin", action: "Generó módulo de autenticación", target: "AuthService.js", time: "5 min", icon: Terminal, color: "#58A6FF" },
  { id: 2, user: "NEXUS-7", action: "Revisó 3 componentes UI", target: "UI Components", time: "18 min", icon: Eye, color: "#3FB950" },
  { id: 3, user: "Pipeline CI/CD", action: "Build exitoso · v0.4.2-beta", target: "Production", time: "32 min", icon: Rocket, color: "#F778BA" },
  { id: 4, user: "NEXUS-3", action: "Sugirió refactoring crítico", target: "PaymentController", time: "1h", icon: Sparkles, color: "#E3B341" },
  { id: 5, user: "Sistema", action: "Error detectado y registrado", target: "UserSession.js", time: "2h", icon: AlertCircle, color: "#F778BA" },
];

export default function UltimasInteracciones() {
  return (
    <div data-testid="ultimas-interacciones" className="bg-[#161B26] border border-[#21262D] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#21262D]">
        <h3 className="font-mono text-sm font-semibold text-[#F0F6FC]">Últimas Interacciones</h3>
        <span className="text-[10px] text-[#484F58]">Hoy</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#21262D]">
            {["Tipo", "Acción", "Destino", "Agente", "Hace"].map((h) => (
              <th key={h} className="text-left px-5 py-2 text-[9px] uppercase tracking-[0.12em] text-[#484F58] font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#21262D]">
          {interactions.map((item, i) => {
            const Icon = item.icon;
            return (
              <tr
                key={item.id}
                data-testid={`interaction-${item.id}`}
                className="fade-in-up hover:bg-[#1C2333] transition-colors"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <td className="px-5 py-2.5">
                  <div className="w-6 h-6 rounded-md bg-[#21262D] border border-[#30363D] flex items-center justify-center">
                    <Icon className="w-3 h-3" strokeWidth={1.5} style={{ color: item.color }} />
                  </div>
                </td>
                <td className="px-5 py-2.5"><p className="text-xs text-[#F0F6FC]">{item.action}</p></td>
                <td className="px-5 py-2.5">
                  <code className="text-[9px] font-mono text-[#8B949E] bg-[#21262D] px-1.5 py-0.5 rounded border border-[#30363D]">{item.target}</code>
                </td>
                <td className="px-5 py-2.5"><span className="text-xs text-[#8B949E]">{item.user}</span></td>
                <td className="px-5 py-2.5"><span className="text-[10px] text-[#484F58]">hace {item.time}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
