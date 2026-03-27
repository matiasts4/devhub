'use client';
import { useState } from "react";
import { Settings, Save, ChevronRight, Monitor, Bot, Shield, Bell } from "lucide-react";
import { toast } from "sonner";

const secciones = [
  {
    id: "general", icon: Monitor, titulo: "General", color: "#58A6FF",
    campos: [
      { id: "idioma", label: "Idioma", tipo: "select", valor: "Español", opciones: ["Español", "English", "Português"] },
      { id: "tema", label: "Tema visual", tipo: "select", valor: "Dark", opciones: ["Dark", "Ultra Dark"] },
      { id: "autosave", label: "Guardar automáticamente", tipo: "toggle", valor: true },
    ],
  },
  {
    id: "agentes", icon: Bot, titulo: "Agentes IA", color: "#3FB950",
    campos: [
      { id: "modelo", label: "Modelo principal", tipo: "select", valor: "GPT-4o", opciones: ["GPT-4o", "Claude 3.5 Sonnet", "Gemini 2.0 Flash"] },
      { id: "temperatura", label: "Temperatura", tipo: "range", valor: 0.7, min: 0, max: 1, step: 0.1 },
      { id: "confirmacion", label: "Confirmar antes de ejecutar", tipo: "toggle", valor: true },
      { id: "autonomo", label: "Modo autónomo", tipo: "toggle", valor: false },
    ],
  },
  {
    id: "seguridad", icon: Shield, titulo: "Seguridad", color: "#F778BA",
    campos: [
      { id: "2fa", label: "Autenticación dos factores", tipo: "toggle", valor: false },
      { id: "sandbox", label: "Sandbox para código IA", tipo: "toggle", valor: true },
      { id: "logs", label: "Logs de auditoría", tipo: "toggle", valor: true },
    ],
  },
  {
    id: "notificaciones", icon: Bell, titulo: "Notificaciones", color: "#E3B341",
    campos: [
      { id: "completadas", label: "Tareas completadas", tipo: "toggle", valor: true },
      { id: "errores", label: "Errores críticos", tipo: "toggle", valor: true },
      { id: "sugerencias", label: "Sugerencias de IA", tipo: "toggle", valor: true },
    ],
  },
];

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-8 h-4 rounded-full transition-all duration-200 ${checked ? "bg-[#238636]" : "bg-[#30363D]"}`}
    >
      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function Ajustes() {
  const [config, setConfig] = useState(
    Object.fromEntries(secciones.flatMap((s) => s.campos.map((c) => [c.id, c.valor])))
  );

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <div className="sticky top-0 z-10 bg-[#0D1117]/95 backdrop-blur-sm border-b border-[#21262D] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-4 h-4 text-[#58A6FF]" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-[#F0F6FC]">Ajustes</h1>
        </div>
        <button
          data-testid="guardar-ajustes-btn"
          onClick={() => toast.success("Configuración guardada")}
          className="flex items-center gap-2 bg-[#238636] text-white font-medium px-3 py-1.5 rounded-lg text-xs hover:bg-[#2EA043] transition-colors active:scale-95"
        >
          <Save className="w-3.5 h-3.5" strokeWidth={2} />
          Guardar
        </button>
      </div>

      <div className="px-6 py-5 max-w-2xl space-y-3">
        {secciones.map((sec, si) => {
          const Icon = sec.icon;
          return (
            <div
              key={sec.id}
              data-testid={`seccion-${sec.id}`}
              className="fade-in-up bg-[#161B26] border border-[#21262D] rounded-xl overflow-hidden"
              style={{ animationDelay: `${si * 60}ms` }}
            >
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#21262D]">
                <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} style={{ color: sec.color }} />
                <h3 className="font-mono text-sm font-semibold text-[#F0F6FC] flex-1">{sec.titulo}</h3>
                <ChevronRight className="w-3.5 h-3.5 text-[#30363D]" strokeWidth={1.5} />
              </div>
              <div className="divide-y divide-[#21262D]">
                {sec.campos.map((campo) => (
                  <div key={campo.id} className="flex items-center justify-between px-5 py-3">
                    <label className="text-sm text-[#8B949E]">{campo.label}</label>
                    <div className="ml-4 flex-shrink-0">
                      {campo.tipo === "toggle" && (
                        <Toggle checked={config[campo.id]} onChange={(v) => setConfig((p) => ({ ...p, [campo.id]: v }))} />
                      )}
                      {campo.tipo === "select" && (
                        <select
                          data-testid={`select-${campo.id}`}
                          value={config[campo.id]}
                          onChange={(e) => setConfig((p) => ({ ...p, [campo.id]: e.target.value }))}
                          className="bg-[#21262D] border border-[#30363D] text-[#F0F6FC] text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#388BFD]/50 appearance-none cursor-pointer"
                        >
                          {campo.opciones.map((op) => <option key={op} value={op} className="bg-[#161B26]">{op}</option>)}
                        </select>
                      )}
                      {campo.tipo === "range" && (
                        <div className="flex items-center gap-3">
                          <input type="range" min={campo.min} max={campo.max} step={campo.step} value={config[campo.id]}
                            onChange={(e) => setConfig((p) => ({ ...p, [campo.id]: parseFloat(e.target.value) }))}
                            className="w-24 accent-[#238636]"
                          />
                          <span className="font-mono text-xs text-[#3FB950] w-6">{config[campo.id]}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
