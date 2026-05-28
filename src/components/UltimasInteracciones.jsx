'use client';
import { Terminal, Eye, Rocket, Sparkles, AlertCircle } from "lucide-react";

const interactions = [
  { id: 1, user: "Dev Admin", action: "Generó módulo de autenticación", target: "AuthService.js", time: "5 min", icon: Terminal, color: "var(--accent-primary)" },
  { id: 2, user: "NEXUS-7", action: "Revisó 3 componentes UI", target: "UI Components", time: "18 min", icon: Eye, color: "var(--success)" },
  { id: 3, user: "Pipeline CI/CD", action: "Build exitoso · v0.4.2-beta", target: "Production", time: "32 min", icon: Rocket, color: "var(--accent-pink)" },
  { id: 4, user: "NEXUS-3", action: "Sugirió refactoring crítico", target: "PaymentController", time: "1h", icon: Sparkles, color: "var(--accent-primary)" },
  { id: 5, user: "Sistema", action: "Error detectado y registrado", target: "UserSession.js", time: "2h", icon: AlertCircle, color: "var(--danger)" },
];

export default function UltimasInteracciones() {
  return (
    <div data-testid="ultimas-interacciones" className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-borders-subtle">
        <h3 className="font-mono text-sm font-semibold text-text-primary">Últimas Interacciones</h3>
        <span className="text-xs text-text-muted">Hoy</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-borders-subtle">
            {["Tipo", "Acción", "Destino", "Agente", "Hace"].map((h) => (
              <th key={h} className="text-left px-5 py-2 text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borders-subtle">
          {interactions.map((item, i) => {
            const Icon = item.icon;
            return (
              <tr
                key={item.id}
                data-testid={`interaction-${item.id}`}
                className="fade-in-up hover:bg-surface-elevated transition-colors cursor-pointer"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <td className="px-5 py-2.5">
                  <div className="w-6 h-6 rounded-md bg-surface-elevated border border-borders-strong flex items-center justify-center">
                    <Icon className="w-3 h-3" strokeWidth={1.5} style={{ color: item.color }} />
                  </div>
                </td>
                <td className="px-5 py-2.5"><p className="text-xs text-text-primary">{item.action}</p></td>
                <td className="px-5 py-2.5">
                  <code className="text-[11px] font-mono text-text-muted bg-surface-elevated px-1.5 py-0.5 rounded border border-borders-strong">{item.target}</code>
                </td>
                <td className="px-5 py-2.5"><span className="text-xs text-text-muted">{item.user}</span></td>
                <td className="px-5 py-2.5"><span className="text-xs text-text-muted">hace {item.time}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
