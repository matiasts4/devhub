import { useState } from "react";
import { Settings, Bell, Bot, Monitor, Shield, Save, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const secciones = [
  {
    id: "general",
    icon: Monitor,
    titulo: "General",
    color: "#00F0FF",
    campos: [
      { id: "proyecto-default", label: "Proyecto por defecto", tipo: "select", valor: "E-commerce V2", opciones: ["E-commerce V2", "Admin Dashboard", "Mobile App"] },
      { id: "idioma", label: "Idioma de la interfaz", tipo: "select", valor: "Español", opciones: ["Español", "English", "Português"] },
      { id: "tema", label: "Tema visual", tipo: "select", valor: "Dark (Neon)", opciones: ["Dark (Neon)", "Dark (Minimal)", "Ultra Dark"] },
      { id: "autosave", label: "Guardar automáticamente", tipo: "toggle", valor: true },
    ],
  },
  {
    id: "agentes",
    icon: Bot,
    titulo: "Agentes IA",
    color: "#39FF14",
    campos: [
      { id: "modelo-principal", label: "Modelo principal", tipo: "select", valor: "GPT-4o", opciones: ["GPT-4o", "Claude 3.5 Sonnet", "Gemini 2.0 Flash"] },
      { id: "temperatura", label: "Temperatura de generación", tipo: "range", valor: 0.7, min: 0, max: 1, step: 0.1 },
      { id: "max-tokens", label: "Tokens máximos por respuesta", tipo: "select", valor: "4096", opciones: ["2048", "4096", "8192", "16384"] },
      { id: "confirmacion", label: "Confirmar antes de ejecutar código", tipo: "toggle", valor: true },
      { id: "modo-autonomo", label: "Modo autónomo (sin confirmaciones)", tipo: "toggle", valor: false },
    ],
  },
  {
    id: "seguridad",
    icon: Shield,
    titulo: "Seguridad",
    color: "#FF007F",
    campos: [
      { id: "2fa", label: "Autenticación de dos factores", tipo: "toggle", valor: false },
      { id: "sesion-timeout", label: "Tiempo de sesión (minutos)", tipo: "select", valor: "60", opciones: ["15", "30", "60", "120", "480"] },
      { id: "logs-auditoria", label: "Habilitar logs de auditoría", tipo: "toggle", valor: true },
      { id: "sandbox", label: "Ejecutar código en sandbox", tipo: "toggle", valor: true },
    ],
  },
  {
    id: "notificaciones",
    icon: Bell,
    titulo: "Notificaciones",
    color: "#FFE600",
    campos: [
      { id: "notif-completadas", label: "Notificar tareas completadas", tipo: "toggle", valor: true },
      { id: "notif-errores", label: "Alertas de errores críticos", tipo: "toggle", valor: true },
      { id: "notif-sugerencias", label: "Sugerencias de arquitectura IA", tipo: "toggle", valor: true },
      { id: "notif-commits", label: "Notificaciones de commits", tipo: "toggle", valor: false },
    ],
  },
];

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-all duration-300 ${checked ? "bg-[#00F0FF]" : "bg-white/15"}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-300 ${checked ? "translate-x-4" : "translate-x-0.5"}`}
      />
    </button>
  );
}

export default function Ajustes() {
  const [config, setConfig] = useState(
    Object.fromEntries(
      secciones.flatMap(s => s.campos.map(c => [c.id, c.valor]))
    )
  );

  const handleChange = (id, value) => {
    setConfig(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = () => {
    toast.success("Configuración guardada", { description: "Los cambios se aplicarán en la próxima sesión de agentes." });
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] dot-grid">
      <div className="sticky top-0 z-10 bg-[#0B0F19]/90 backdrop-blur-md border-b border-white/8 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-[#00F0FF]" strokeWidth={1.5} />
          <h1 className="font-mono text-lg font-bold text-white">Ajustes Locales</h1>
        </div>
        <button
          data-testid="guardar-ajustes-btn"
          onClick={handleSave}
          className="flex items-center gap-2 bg-[#00F0FF] text-[#0B0F19] font-semibold px-4 py-2 rounded-lg text-xs hover:bg-[#00F0FF]/85 hover:shadow-[0_0_12px_rgba(0,240,255,0.35)] transition-all active:scale-95"
        >
          <Save className="w-3.5 h-3.5" strokeWidth={2} />
          Guardar cambios
        </button>
      </div>

      <div className="px-6 py-5 max-w-3xl mx-auto space-y-4">
        {secciones.map((seccion, si) => {
          const Icon = seccion.icon;
          return (
            <div
              key={seccion.id}
              data-testid={`seccion-${seccion.id}`}
              className="fade-in-up bg-[#111827]/60 border border-white/8 rounded-xl overflow-hidden"
              style={{ animationDelay: `${si * 80}ms` }}
            >
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/8">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${seccion.color}18`, border: `1px solid ${seccion.color}30` }}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: seccion.color }} />
                </div>
                <h3 className="font-mono font-semibold text-sm text-white">{seccion.titulo}</h3>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 ml-auto" strokeWidth={1.5} />
              </div>

              <div className="divide-y divide-white/5">
                {seccion.campos.map(campo => (
                  <div key={campo.id} className="flex items-center justify-between px-5 py-3.5">
                    <label className="text-sm text-slate-300">{campo.label}</label>
                    <div className="flex-shrink-0 ml-4">
                      {campo.tipo === "toggle" && (
                        <Toggle
                          checked={config[campo.id]}
                          onChange={(v) => handleChange(campo.id, v)}
                        />
                      )}
                      {campo.tipo === "select" && (
                        <select
                          data-testid={`select-${campo.id}`}
                          value={config[campo.id]}
                          onChange={(e) => handleChange(campo.id, e.target.value)}
                          className="bg-white/5 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#00F0FF]/40 appearance-none cursor-pointer"
                        >
                          {campo.opciones.map(op => (
                            <option key={op} value={op} className="bg-[#111827]">{op}</option>
                          ))}
                        </select>
                      )}
                      {campo.tipo === "range" && (
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={campo.min}
                            max={campo.max}
                            step={campo.step}
                            value={config[campo.id]}
                            onChange={(e) => handleChange(campo.id, parseFloat(e.target.value))}
                            className="w-28 accent-[#00F0FF]"
                          />
                          <span className="font-mono text-xs text-[#00F0FF] w-8">{config[campo.id]}</span>
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
