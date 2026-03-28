'use client';
import { Bot, Hammer } from "lucide-react";

export default function ChatAgente({ projectName = "el proyecto" }) {
  return (
    <div
      data-testid="chat-agente"
      className="flex flex-col bg-surface-card border border-borders-subtle rounded-xl overflow-hidden items-center justify-center p-6 text-center"
      style={{ minHeight: "380px" }}
    >
      <div className="w-12 h-12 rounded-full bg-[#388BFD]/10 border border-[#388BFD]/20 flex items-center justify-center mb-4">
        <Bot className="w-6 h-6 text-accent-primary" strokeWidth={1.5} />
      </div>
      <h3 className="text-text-primary font-semibold text-sm mb-2">Agente de Proyecto</h3>
      <p className="text-xs text-text-muted max-w-[200px] mb-4">
        La asistencia de IA contextualizada para <strong>{projectName}</strong> se conectará próximamente.
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-elevated border border-borders-strong">
        <Hammer className="w-3.5 h-3.5 text-[#E3B341]" strokeWidth={1.5} />
        <span className="text-[10px] font-medium text-[#E3B341]">En Construcción</span>
      </div>
    </div>
  );
}
