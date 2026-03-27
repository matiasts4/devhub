import { useState, useEffect, useRef } from "react";
import { Send, Bot, User, Sparkles } from "lucide-react";

const initialMessages = [
  { id: 1, role: "agent", text: "Hola, soy NEXUS-7. Estoy monitoreando el proyecto E-commerce V2. ¿En qué puedo ayudarte?" },
  { id: 2, role: "user", text: "¿Cuál es el estado del módulo de pagos?" },
  { id: 3, role: "agent", text: "El módulo de pagos está al 60% de completitud. He detectado que falta integrar Stripe SDK para el procesamiento de transacciones. ¿Quieres que proceda con la implementación?" },
];

const mockResponses = [
  "Analizando el código base del proyecto... Encontré 3 áreas de mejora en los controladores.",
  "He detectado una oportunidad de optimización en el módulo de autenticación. El tiempo de respuesta puede reducirse un 40%.",
  "Puedo generar los tests unitarios para el componente solicitado. ¿Quieres que incluya tests de integración también?",
  "Revisando las dependencias del proyecto... Hay 2 paquetes desactualizados con vulnerabilidades conocidas.",
  "La arquitectura actual es sólida. Sin embargo, sugiero agregar caché con Redis para mejorar el rendimiento.",
  "Generando componentes para el módulo solicitado. Estimado: 8 archivos, ~450 líneas de código.",
  "He completado el análisis de seguridad. Encontré 1 vulnerabilidad de tipo XSS en el formulario de registro.",
];

export default function ChatAgente() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", text }]);
    setInput("");
    setIsTyping(true);
    setTimeout(() => {
      const response = mockResponses[Math.floor(Math.random() * mockResponses.length)];
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "agent", text: response }]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  return (
    <div
      data-testid="chat-agente"
      className="flex flex-col bg-[#070A10] border border-white/10 rounded-xl overflow-hidden"
      style={{ minHeight: "420px", height: "100%" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-[#00F0FF]/15 border border-[#00F0FF]/30 flex items-center justify-center">
            <Bot className="w-4 h-4 text-[#00F0FF]" strokeWidth={1.5} />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#39FF14] border border-[#070A10]" />
        </div>
        <div>
          <p className="text-xs font-semibold text-white font-mono">NEXUS-7</p>
          <p className="text-[10px] text-[#39FF14]">En línea · Agente Desarrollador</p>
        </div>
        <div className="ml-auto">
          <Sparkles className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.5} />
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-3"
        style={{ scrollbarWidth: "none" }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                msg.role === "agent"
                  ? "bg-[#00F0FF]/15 border border-[#00F0FF]/25"
                  : "bg-white/10 border border-white/15"
              }`}
            >
              {msg.role === "agent" ? (
                <Bot className="w-3 h-3 text-[#00F0FF]" strokeWidth={1.5} />
              ) : (
                <User className="w-3 h-3 text-white" strokeWidth={1.5} />
              )}
            </div>
            <div
              className={`max-w-[78%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                msg.role === "agent"
                  ? "bg-[#00F0FF]/8 border border-[#00F0FF]/18 text-slate-200"
                  : "bg-white/8 border border-white/12 text-white"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-[#00F0FF]/15 border border-[#00F0FF]/25 flex items-center justify-center">
              <Bot className="w-3 h-3 text-[#00F0FF]" strokeWidth={1.5} />
            </div>
            <div className="bg-[#00F0FF]/8 border border-[#00F0FF]/18 rounded-xl px-3 py-2.5 flex gap-1.5 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] typing-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] typing-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] typing-dot" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/10 flex-shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            data-testid="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Mensaje a NEXUS-7..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#00F0FF]/40 focus:bg-white/8 transition-all"
          />
          <button
            data-testid="chat-send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || isTyping}
            className="bg-[#00F0FF] text-[#0B0F19] rounded-lg px-3 py-2 hover:bg-[#00F0FF]/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 hover:shadow-[0_0_10px_rgba(0,240,255,0.35)]"
          >
            <Send className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
