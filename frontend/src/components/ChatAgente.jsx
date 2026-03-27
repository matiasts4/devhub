'use client';
import { useState, useEffect, useRef } from "react";
import { Send, Bot, User } from "lucide-react";

const getInitialMessages = (projectName) => [
  { id: 1, role: "agent", text: `Hola, soy NEXUS-7. Estoy monitoreando "${projectName}". ¿En qué puedo ayudarte?` },
  { id: 2, role: "user", text: "¿Cuál es el estado actual del proyecto?" },
  { id: 3, role: "agent", text: "El proyecto va bien. Las secciones principales están avanzando según lo planificado. Tengo 2 tareas en ejecución ahora mismo. ¿Necesitas detalles de alguna sección específica?" },
];

const mockResponses = [
  "Analizando el código base... Encontré 3 áreas de mejora.",
  "Puedo generar los tests unitarios para ese módulo. ¿Confirmas?",
  "Revisando dependencias del proyecto — hay 2 paquetes con vulnerabilidades.",
  "La arquitectura actual es sólida. Sugiero agregar caché para mejorar un 40% el rendimiento.",
  "Generando componentes para el módulo solicitado. Estimo ~8 archivos.",
  "He completado el análisis. ¿Quieres que proceda con la implementación?",
  "Detecté una oportunidad de refactoring en el módulo principal. Puedo aplicarlo automáticamente.",
];

export default function ChatAgente({ projectName = "el proyecto" }) {
  const [messages, setMessages] = useState(() => getInitialMessages(projectName));
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", text }]);
    setInput("");
    setIsTyping(true);
    setTimeout(() => {
      const r = mockResponses[Math.floor(Math.random() * mockResponses.length)];
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "agent", text: r }]);
      setIsTyping(false);
    }, 900 + Math.random() * 900);
  };

  return (
    <div
      data-testid="chat-agente"
      className="flex flex-col bg-[#161B26] border border-[#21262D] rounded-xl overflow-hidden"
      style={{ minHeight: "380px" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#21262D] flex-shrink-0">
        <div className="relative">
          <div className="w-7 h-7 rounded-full bg-[#388BFD]/15 border border-[#388BFD]/25 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-[#58A6FF]" strokeWidth={1.5} />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#3FB950] border border-[#161B26]" />
        </div>
        <div>
          <p className="text-xs font-semibold text-[#F0F6FC] font-mono">NEXUS-7</p>
          <p className="text-[9px] text-[#3FB950]">En línea · Agente Desarrollador</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5" style={{ scrollbarWidth: "none" }}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === "agent" ? "bg-[#388BFD]/15 border border-[#388BFD]/20" : "bg-[#21262D] border border-[#30363D]"
            }`}>
              {msg.role === "agent"
                ? <Bot className="w-2.5 h-2.5 text-[#58A6FF]" strokeWidth={1.5} />
                : <User className="w-2.5 h-2.5 text-[#8B949E]" strokeWidth={1.5} />
              }
            </div>
            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
              msg.role === "agent"
                ? "bg-[#0D1117] border border-[#21262D] text-[#E6EDF3]"
                : "bg-[#21262D] border border-[#30363D] text-[#F0F6FC]"
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-2">
            <div className="w-5 h-5 rounded-full bg-[#388BFD]/15 border border-[#388BFD]/20 flex items-center justify-center">
              <Bot className="w-2.5 h-2.5 text-[#58A6FF]" strokeWidth={1.5} />
            </div>
            <div className="bg-[#0D1117] border border-[#21262D] rounded-xl px-3 py-2 flex gap-1.5 items-center">
              <span className="w-1 h-1 rounded-full bg-[#8B949E] typing-dot" />
              <span className="w-1 h-1 rounded-full bg-[#8B949E] typing-dot" />
              <span className="w-1 h-1 rounded-full bg-[#8B949E] typing-dot" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[#21262D] flex-shrink-0">
        <div className="flex gap-2">
          <input
            data-testid="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Escribe a NEXUS-7..."
            className="flex-1 bg-[#0D1117] border border-[#21262D] rounded-lg px-3 py-2 text-xs text-[#F0F6FC] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD]/50 transition-all"
          />
          <button
            data-testid="chat-send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || isTyping}
            className="bg-[#238636] text-white rounded-lg px-3 py-2 hover:bg-[#2EA043] disabled:opacity-30 transition-colors active:scale-95"
          >
            <Send className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
