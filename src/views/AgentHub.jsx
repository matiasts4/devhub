'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Brain,
  Bot,
  Send,
  TerminalSquare,
  Plus,
  Loader2,
  Slash,
  MessageSquarePlus,
  History,
  Trash2,
  Cpu,
  FileText,
  Sparkles,
  ChevronDown,
  Search,
  ListChecks,
  PenTool,
  CheckSquare,
  Code,
  ShieldCheck,
  Archive,
  GitPullRequest,
  Bug,
  Scale,
  TestTube,
  Wrench,
  Palette,
  Zap,
  Monitor,
  Database,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/db/localSupabase';
import ChatMarkdown from '@/components/chat/ChatMarkdown';
import StreamingMessage from '@/components/chat/StreamingMessage';
import { enforceDocOpsGateOnLaunchCommand, shellQuotePrompt } from '@/lib/docopsPrompts';
import MCPAccordion from '@/components/chat/MCPAccordion';
import { detectMcpOutput } from '@/components/chat/utils/detectMcpOutput';
import { slashCommands, filterSlashCommands, groupByCategory } from '@/lib/slashSkills';

// Map icon names to lucide-react components
const iconMap = {
  Search,
  FileText,
  ListChecks,
  PenTool,
  CheckSquare,
  Code,
  ShieldCheck,
  Archive,
  Brain,
  GitPullRequest,
  Bug,
  Scale,
  TestTube,
  Wrench,
  Palette,
  Zap,
  Monitor,
  TerminalSquare, // fallback
};

// UI Components
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const formatMessage = (content) => {
  // 1. Tags Completos
  let formatted = content.replace(
    /<execute_opencode agent="([^"]+)">(.*?)<\/execute_opencode>/gis,
    '\n\n> **▶ Dispatching Sub-Agent**: `$1`\n> \n> **Instructions:** $2\n\n'
  );

  formatted = formatted.replace(
    /<execute_engram tool="([^"]+)" args='(.*?)'><\/execute_engram>/gis,
    '\n\n> **◈ Accediendo a Memoria (Engram MCP)**\n> \n> **Herramienta:** `$1`\n> **Argumentos:** `$2`\n\n'
  );

  // 2. Tags Parciales (mientras la IA está escribiendo/Streaming)
  formatted = formatted.replace(
    /<execute_opencode agent="([^"]+)">(.*?)$/gis,
    '\n\n> *Preparando Sub-Agente...*\n> \n> **Agente:** `$1`\n> **Instrucciones:** $2\n\n'
  );

  formatted = formatted.replace(
    /<execute_engram tool="([^"]*)"?.*?$/gis,
    '\n\n> *Engram MCP contactando...*\n> \n> **Herramienta:** `$1`\n\n'
  );

  formatted = formatted.replace(
    /<execute_(opencode|engram).*?$/gis,
    '\n\n> *Generando ejecución de sub-sistema...*\n\n'
  );

  return formatted;
};

export default function AgentHub() {
  const { project } = useOutletContext();
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isWaitingForSubagent, setIsWaitingForSubagent] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // Streaming optimization: ref-based incremental updates
  // Only the StreamingMessage component re-renders on each chunk
  const streamingContentRef = useRef('');
  const [streamingModel, setStreamingModel] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionUsage, setSessionUsage] = useState({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
  const [isCompressing, setIsCompressing] = useState(false);

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);

  const [llmConfig, setLlmConfig] = useState(null);
  const [activeProviderName, setActiveProviderName] = useState(null);
  const [activeModelOverride, setActiveModelOverride] = useState('');
  const [favoriteModels, setFavoriteModels] = useState([]);
  const [slashFilter, setSlashFilter] = useState(''); // filter text after /

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const supabase = createClient();

  // 1. Load History
  useEffect(() => {
    if (project?.id) {
      loadSessions();
      loadLlmConfig();
    }
  }, [project?.id]);

  const loadLlmConfig = async () => {
    try {
      const res = await fetch('/api/settings/llm-providers');
      if (res.ok) {
        const config = await res.json();
        setLlmConfig(config);

        let provider = null;
        for (const p of config.priorityOrder || []) {
          const pc = config.providers?.[p];
          if (p === 'openrouter' && pc?.OPENROUTER_API_KEY) {
            provider = p;
            break;
          }
          if (p === 'copilot' && pc?.COPILOT_OAUTH_TOKEN) {
            provider = p;
            break;
          }
          if (p === 'direct' && pc?.LLM_BASE_URL) {
            provider = p;
            break;
          }
        }

        setActiveProviderName(provider);

        if (provider && config.favoriteModels) {
          const pFavs = Object.keys(config.favoriteModels)
            .filter((k) => k.startsWith(provider + '.') && config.favoriteModels[k])
            .map((k) => k.replace(provider + '.', ''));
          setFavoriteModels(pFavs);

          if (pFavs.length > 0) {
            // Set default override if you wish
          }
        }
      }
    } catch (e) {
      console.warn('Could not load LLM config', e);
    }
  };

  const loadSessions = async () => {
    const { data } = await supabase
      .from('agent_hub_sessions')
      .select('*')
      .eq('project_id', project.id)
      .order('updated_at', { ascending: false });

    if (data) {
      setSessions(data);
      if (data.length > 0 && !currentSessionId) {
        loadMessages(data[0].id);
      }
    }
  };

  const loadMessages = async (sessionId) => {
    setCurrentSessionId(sessionId);
    const { data } = await supabase
      .from('agent_hub_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, isWaitingForSubagent]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  // Handle Event for Terminal Exit
  useEffect(() => {
    const handleTerminalExit = (e) => {
      const { id } = e.detail;
      // If we are waiting for a subagent and a terminal exits
      if (isWaitingForSubagent) {
        setIsWaitingForSubagent(false);
        toast.success('El Sub-Agente finalizó su tarea.');
        // Trigger silent LLM request
        handleSendInjection(
          `[SYSTEM NOTIFICATION]: El proceso del sub-agente en la terminal ha finalizado. Analiza si se cumplió el objetivo y comunícale un resumen ejecutivo al usuario. Usa herramientas de lectura si necesitas verificar archivos.`
        );
      }
    };

    window.addEventListener('devhub:terminal-exit', handleTerminalExit);
    return () => window.removeEventListener('devhub:terminal-exit', handleTerminalExit);
  }, [isWaitingForSubagent, project?.id]); // eslint-disable-line

  const createNewSession = async () => {
    const newId = crypto.randomUUID();
    const newSession = {
      id: newId,
      project_id: project.id,
      title: 'Nueva Conversación',
      agent_model: 'Gentleman',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await supabase.from('agent_hub_sessions').insert(newSession);
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setMessages([]);
  };

  // Update session title with first user message
  const updateSessionTitle = async (sessionId, title) => {
    const truncated = title.length > 50 ? title.substring(0, 50) + '...' : title;
    await supabase
      .from('agent_hub_sessions')
      .update({ title: truncated, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: truncated } : s)));
  };

  const deleteSession = async (e, id) => {
    e.stopPropagation();
    await supabase.from('agent_hub_sessions').delete().eq('id', id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setMessages([]);
    }
  };

  // 2. Chat Logic
  const handleSend = async (overridePrompt = null) => {
    const textToSend = overridePrompt || prompt;
    if (!textToSend.trim() || isTyping || !project?.id) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      const newSession = {
        id: sessionId,
        project_id: project.id,
        title: textToSend.substring(0, 30) + '...',
        agent_model: 'Gentleman',
        updated_at: new Date().toISOString(),
      };
      await supabase.from('agent_hub_sessions').insert(newSession);
      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(sessionId);
    } else {
      // If session still says "Nueva Conversación", update title with first message
      const session = sessions.find((s) => s.id === sessionId);
      if (session && session.title === 'Nueva Conversación') {
        updateSessionTitle(sessionId, textToSend);
      }
    }

    const userMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: 'user',
      content: textToSend,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setPrompt('');
    setIsTyping(true);

    supabase
      .from('agent_hub_messages')
      .insert(userMessage)
      .then(() => {
        supabase
          .from('agent_hub_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId);
      });

    await processLLM([...messages, userMessage], sessionId);
  };

  const handleSendInjection = async (overridePrompt) => {
    if (!project?.id || !currentSessionId) return;

    const userMessage = {
      id: crypto.randomUUID(),
      session_id: currentSessionId,
      role: 'user',
      content: overridePrompt,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);

    await supabase.from('agent_hub_messages').insert(userMessage);
    await processLLM([...messages, userMessage], currentSessionId);
  };

  const handleCompressContext = async () => {
    if (!currentSessionId || isCompressing || messages.length <= 3) return;

    setIsCompressing(true);
    const toastId = toast.loading('Comprimiendo espacio de contexto...');

    try {
      const res = await fetch('/api/agenthub/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          project_id: project?.id,
          model: activeModelOverride || 'gpt-4o-mini',
          keep_last_n: 3
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Error comprimiendo');
      }

      await loadMessages(currentSessionId);
      toast.success('Contexto comprimido exitosamente', { id: toastId });
    } catch (e) {
      toast.error(`Error de compresión: ${e.message}`, { id: toastId });
    } finally {
      setIsCompressing(false);
    }
  };

  const processLLM = async (chatMessages, sessionId) => {
    try {
      const res = await fetch('/api/agenthub/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          projectName: project.name,
          modelOverride: activeModelOverride || undefined,
          messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Error del LLM');
      }

      let activeMessage = '';
      let activeModel = '';
      const assistantMessageId = crypto.randomUUID();

      // Reset streaming refs
      streamingContentRef.current = '';
      setStreamingModel('');
      setIsStreaming(true);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Mantener la última línea incompleta en el buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'meta') {
              activeModel = parsed.model_used;
              setStreamingModel(activeModel);
            } else if (parsed.type === 'error') {
              throw new Error(parsed.error);
            } else if (parsed.type === 'usage') {
              setSessionUsage(parsed.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
            } else if (parsed.type === 'chunk') {
              activeMessage += parsed.content;
              // KEY OPTIMIZATION: Update ref only — NO state change, NO re-render of message list
              streamingContentRef.current = activeMessage;
            }
          } catch (e) {
            // Ignorar líneas malformadas temporales
          }
        }
      }

      // Streaming complete — flush to messages state (single update)
      setIsStreaming(false);
      const finalMessage = {
        id: assistantMessageId,
        session_id: sessionId,
        role: 'assistant',
        content: activeMessage,
        meta: JSON.stringify({ model: activeModel }),
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, finalMessage]);

      // Save to DB and parse commands
      await supabase.from('agent_hub_messages').insert(finalMessage);
      await parseAndExecuteCommands(activeMessage);
    } catch (err) {
      setIsStreaming(false);
      toast.error(err.message);
    } finally {
      setIsTyping(false);
    }
  };

  const parseAndExecuteCommands = async (replyContent) => {
    // 1. Interceptar Sub-Agentes de OpenCode
    const matchOpenCode = replyContent.match(
      /<execute_opencode agent="([^"]+)">(.*?)<\/execute_opencode>/is
    );
    if (matchOpenCode) {
      const agentProfile = matchOpenCode[1];
      const agentGoal = matchOpenCode[2].trim();
      toast.info(`Delegando tarea a: ${agentProfile}`);
      dispatchOpenCode(agentProfile, agentGoal);
      return;
    }

    // 2. Interceptar Herramientas de Memoria (Engram MCP)
    const matchEngram = replyContent.match(
      /<execute_engram tool="([^"]+)" args='(.*?)'><\/execute_engram>/is
    );
    if (matchEngram) {
      const toolName = matchEngram[1];
      let args = {};
      try {
        args = JSON.parse(matchEngram[2]);
      } catch (e) {
        toast.error('Error al parsear argumentos de Engram (JSON inválido)');
        return;
      }

      toast.info(`MCP: Ejecutando Engram -> ${toolName}`);
      setIsWaitingForSubagent(true); // Reusamos el estado de bloqueo de UI

      try {
        const res = await fetch('/api/mcp/engram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolName, args }),
        });

        if (!res.ok) {
          const textData = await res.text();
          throw new Error(textData);
        }

        const mcpResult = await res.json();

        let inyectedOutput = `[Respuesta del Sistema Engram]:\n${mcpResult.content || 'Sin resultados'}`;
        if (mcpResult.error || mcpResult.success === false) {
          inyectedOutput = `[Error del Sistema Engram]:\n${mcpResult.error || mcpResult.content || 'Fallo en la ejecución de la herramienta'}`;
        }

        // Llamada silenciosa inyectando la info del MCP de vuelta al cerebro del chat
        handleSendInjection(inyectedOutput);
      } catch (e) {
        toast.error(`Fallo de red llamando a MCP: ${e.message}`);
        handleSendInjection(
          `[Error del Sistema Engram]:\nEl servidor local falló al conectar o ejecutar la herramienta: ${e.message}`
        );
      } finally {
        setIsWaitingForSubagent(false);
      }
    }
  };

  const dispatchOpenCode = (selectedAgent, commandPrompt) => {
    setIsWaitingForSubagent(true);
    const agentId = `hub-${selectedAgent}-${Date.now()}`;
    const command = enforceDocOpsGateOnLaunchCommand(
      `opencode --agent ${selectedAgent} --prompt ${shellQuotePrompt(
        `[Tú eres el sub-agente. Instrucciones: "${commandPrompt}"]`
      )}`
    );

    // No redirigimos al usuario fuera del chat, el TerminalWorkspacesManager lo abrirá en background o split.
    window.dispatchEvent(
      new CustomEvent('devhub:run-agent', {
        detail: {
          taskId: agentId,
          command: command,
          selectedAgent,
          launchOrigin: 'hub-launch-delegation',
          promptSummary: commandPrompt.slice(0, 100),
        },
      })
    );
  };

  const handlePromptChange = (e) => {
    const val = e.target.value;
    setPrompt(val);

    // Slash command trigger and filtering
    if (val === '/') {
      setShowSlashMenu(true);
      setSlashIndex(0);
      setSlashFilter('');
    } else if (val.startsWith('/')) {
      const afterSlash = val.slice(1).trim();
      if (afterSlash) {
        setShowSlashMenu(true);
        setSlashFilter(afterSlash.toLowerCase());
        setSlashIndex(0); // Reset index on filter change
      } else {
        setShowSlashMenu(true);
        setSlashFilter('');
        setSlashIndex(0);
      }
    } else {
      setShowSlashMenu(false);
      setSlashFilter('');
    }
  };

  const handleSlashSelect = (cmd) => {
    setPrompt(cmd + ' ');
    setShowSlashMenu(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    const filtered = filterSlashCommands(slashFilter);
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((prev) => (prev + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSlashSelect(filtered[slashIndex].cmd);
        return;
      }
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  return (
    <div className="flex flex-col h-full bg-[#090c13] text-gray-200 overflow-hidden">
      {/* Elegante Header con Sesiones en Dropdown */}
      <div className="flex-shrink-0 h-[50px] px-5 border-b border-[#1a2333] flex items-center justify-between bg-[#090c13]">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-[#5b8cff]/10 border border-[#5b8cff]/30 flex items-center justify-center">
            <Brain className="w-4 h-4 text-[#5b8cff]" />
          </div>
          <div>
            <h1 className="text-sm font-bold font-mono text-gray-100 uppercase tracking-wide">
              Agent Hub
            </h1>
            <p className="text-xs text-gray-400 font-sans tracking-wider uppercase">
              Orquestador SDD
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Token Metrics Widget */}
          {sessionUsage.total_tokens > 0 && (
            <div className="hidden md:flex items-center gap-2 px-3 h-8 bg-[#182234] border border-[#2a3441] rounded-md text-xs font-mono text-gray-300" title="Tokens Acumulados de la Sesión">
               <Database className="w-3.5 h-3.5 text-[#5b8cff]" />
               <span>{(sessionUsage.total_tokens / 1000).toFixed(1)}k</span>
               {activeProviderName === 'copilot' && (
                 <span className="text-gray-500 text-[10px] ml-1 uppercase pl-2 border-l border-[#2a3441]">Copilot</span>
               )}
            </div>
          )}

          <Button
            onClick={handleCompressContext}
            disabled={!currentSessionId || isCompressing || messages.length <= 3}
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs bg-[#182234] border border-[#2a3441] hover:bg-[#2a364a] hover:text-red-400 disabled:opacity-30"
            title="Comprimir Contexto Atómico (Libera tokens resumiendo la historia antigua)"
          >
            {isCompressing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" /> : <Archive className="w-3.5 h-3.5 text-red-400" />}
            <span className="hidden sm:inline">Comprimir</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 bg-[#182234] border-[#2a3441] hover:bg-[#1e2a3f] text-gray-200"
              >
                <History className="w-3.5 h-3.5" />
                <span className="max-w-[120px] truncate text-xs">
                  {currentSession ? currentSession.title : 'Sesiones'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[300px] bg-[#111825] border-[#2a3441] text-gray-200"
            >
              <DropdownMenuLabel className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-1">
                Historial de Charlas
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#2a3441]" />
              <div className="max-h-[300px] overflow-y-auto">
                {sessions.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-gray-500">
                    No hay sesiones previas
                  </div>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => loadMessages(s.id)}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#1e2a3f] rounded-md transition-colors ${currentSessionId === s.id ? 'bg-[#5b8cff]/10 text-[#5b8cff]' : ''}`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">{s.title}</span>
                        <span className="text-xs opacity-60">
                          {new Date(s.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        onClick={(e) => deleteSession(e, s.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 hover:bg-red-400/10 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <DropdownMenuSeparator className="bg-[#2a3441]" />
              <DropdownMenuItem
                onClick={createNewSession}
                className="cursor-pointer font-medium text-[#5b8cff] focus:bg-[#5b8cff]/10 justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Nueva Conversación
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            onClick={createNewSession}
            variant="outline"
            size="sm"
            className="h-8 gap-2 bg-[#5b8cff] hover:bg-[#4676e8] text-white border-transparent shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline font-medium">Nueva Conversación</span>
          </Button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div
        className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth"
        style={{
          backgroundImage: 'radial-gradient(circle at center, #0e1219 0%, transparent 80%)',
        }}
      >
        <div className="max-w-4xl mx-auto space-y-8 pb-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-80">
              <div className="w-16 h-16 bg-[#5b8cff]/10 rounded-2xl flex items-center justify-center border border-[#5b8cff]/20 mb-6 relative">
                <Bot className="w-8 h-8 text-[#5b8cff]" />
                <Sparkles className="w-4 h-4 text-emerald-400 absolute -top-2 -right-2 font-bold" />
              </div>
              <h2 className="text-xl font-mono text-gray-200 mb-2">El Arquitecto está Listo</h2>
              <p className="text-sm text-gray-400 max-w-md text-center mb-8">
                Describí el problema técnico. Orquestaré a los sub-agentes en la PTY para explorar
                base de código, diseñar arquitecturas y aplicar cambios sin que levantes un dedo.
              </p>

              <div className="flex flex-wrap gap-3 justify-center max-w-2xl">
                {[
                  { cmd: 'Analiza un stack trace...' },
                  { cmd: 'Explora por qué falla la navbar' },
                  { cmd: 'Diseña y aplica tests unitarios' },
                ].map((sc, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(sc.cmd)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-mono font-medium rounded-full bg-[#182234] border border-[#2a3441] text-gray-300 hover:text-white hover:border-[#5b8cff]/50 transition-colors shadow-sm cursor-pointer"
                  >
                    <TerminalSquare className="w-3.5 h-3.5 text-[#5b8cff]" />
                    {sc.cmd}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              // Interceptar Mensajes inyectados del Sistema MCP
              const isMcpResponse =
                m.content.startsWith('[Respuesta del Sistema Engram]:') ||
                m.content.startsWith('[Error del Sistema Engram]:');

              if (isMcpResponse && m.role === 'user') {
                const { type, defaultOpen } = detectMcpOutput(m.content);
                return (
                  <div
                    key={m.id}
                    className="flex gap-4 flex-row-reverse mb-2 group w-full justify-start"
                  >
                    <div className="w-9 h-9 mt-1 rounded-xl flex-shrink-0 flex items-center justify-center bg-[#1e2a3f] border border-[#2a3441]">
                      <TerminalSquare
                        className={`w-4 h-4 ${type === 'error' ? 'text-red-400' : 'text-amber-500'}`}
                      />
                    </div>
                    <div className="max-w-[88%] w-full">
                      <MCPAccordion content={m.content} defaultOpen={defaultOpen} />
                    </div>
                  </div>
                );
              }

              // Custom formatting logic for <execute_opencode> tags so they look nice
              const displayedContent = formatMessage(m.content);

              return (
                <div
                  key={m.id}
                  className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''} mb-2`}
                >
                  <div
                    className={`w-9 h-9 mt-1 rounded-xl flex-shrink-0 flex items-center justify-center ${m.role === 'user' ? 'bg-[#1e2a3f] border border-[#2a3441]' : 'bg-[#5b8cff]/10 border border-[#5b8cff]/30 shadow-[0_0_15px_rgba(91,140,255,0.15)]'}`}
                  >
                    {m.role === 'user' ? (
                      <Cpu className="w-4 h-4 text-gray-400" />
                    ) : (
                      <Brain className="w-5 h-5 text-[#5b8cff]" />
                    )}
                  </div>

                  <div
                    className={`max-w-[88%] rounded-2xl px-5 py-4 ${m.role === 'user' ? 'bg-[#182234] border border-[#2a3441] text-gray-200 shadow-sm' : 'bg-transparent text-gray-300'}`}
                  >
                    <div
                      className="prose prose-invert prose-sm max-w-none 
                                  prose-pre:bg-[#0c1018] prose-pre:border prose-pre:border-[#2a3441] 
                                  prose-code:text-[#9bc2ff] prose-a:text-[#5b8cff]
                                  prose-blockquote:border-l-[#5b8cff] prose-blockquote:bg-[#5b8cff]/5 prose-blockquote:py-1 prose-blockquote:pr-4"
                    >
                      {m.role === 'user' ? (
                        <ChatMarkdown>{m.content}</ChatMarkdown>
                      ) : (
                        <ChatMarkdown>{displayedContent}</ChatMarkdown>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {isWaitingForSubagent && (
            <div className="flex gap-4 items-center pl-2 py-4">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-amber-500 uppercase tracking-widest flex items-center gap-2">
                  <TerminalSquare className="w-4 h-4" />
                  Sub-Agente en Ejecución...
                </span>
                <span className="text-xs text-gray-500 italic mt-0.5">
                  Esperando que la terminal finalice su tarea o envíe un reporte de salida...
                </span>
              </div>
            </div>
          )}

          {isStreaming && (
            <StreamingMessage contentRef={streamingContentRef} model={streamingModel} />
          )}

          {isTyping && !isWaitingForSubagent && !isStreaming && (
            <div className="flex gap-4 items-start pb-4">
              <div className="w-9 h-9 mt-1 rounded-xl bg-[#5b8cff]/10 border border-[#5b8cff]/30 flex items-center justify-center">
                <div className="flex gap-1">
                  <div className="w-1 h-1 rounded-full bg-[#5b8cff] animate-bounce" />
                  <div
                    className="w-1 h-1 rounded-full bg-[#5b8cff] animate-bounce"
                    style={{ animationDelay: '0.15s' }}
                  />
                  <div
                    className="w-1 h-1 rounded-full bg-[#5b8cff] animate-bounce"
                    style={{ animationDelay: '0.3s' }}
                  />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 bg-[#090c13] p-4 pt-2 pb-8 border-t border-[#1a2333]">
        <div className="max-w-4xl mx-auto relative">
          <div
            className={`bg-[#111825] border transition-all rounded-2xl shadow-xl flex flex-col ${isWaitingForSubagent ? 'border-amber-500/50 opacity-80' : 'border-[#2a3441] focus-within:border-[#5b8cff]/60'}`}
          >
            {isWaitingForSubagent && (
              <div className="absolute inset-0 bg-black/40 z-10 rounded-2xl flex items-center justify-center backdrop-blur-sm cursor-not-allowed">
                <span className="font-mono text-xs text-amber-400 font-bold bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/30">
                  Bloqueado: Trabajo Asíncrono en Curso
                </span>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={handleKeyDown}
              placeholder="Ordenale al orquestador. Ej: 'Rediseñemos el flujo de login usando la especificación SDD...'"
              disabled={isTyping || isWaitingForSubagent}
              className="w-full min-h-[56px] max-h-[250px] bg-transparent text-gray-200 text-sm p-4 outline-none resize-none placeholder:text-gray-600 font-sans"
            />

            {showSlashMenu &&
              (() => {
                const filtered = filterSlashCommands(slashFilter);
                const grouped = groupByCategory(filtered);
                const categoryOrder = ['SDD', 'MCP', 'Skills', 'UX/UI'];

                return (
                  <div className="absolute bottom-full left-4 mb-2 w-[420px] bg-[#1a2333] border border-[#2a3441] rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    {/* Header */}
                    <div className="px-4 py-2.5 bg-[#111825] border-b border-[#2a3441] flex items-center justify-between">
                      <span className="text-xs font-bold tracking-wider text-gray-500 uppercase">
                        Comandos
                      </span>
                      {slashFilter && (
                        <span className="text-xs text-[#5b8cff] font-mono">
                          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="py-1 max-h-[320px] overflow-y-auto">
                      {filtered.length === 0 ? (
                        <div className="px-4 py-6 text-center text-xs text-gray-500">
                          No se encontraron comandos para "{slashFilter}"
                        </div>
                      ) : (
                        categoryOrder
                          .filter((cat) => grouped[cat])
                          .flatMap((cat) => [
                            // Category header
                            <div
                              key={`cat-${cat}`}
                              className="px-3 py-1.5 text-[11px] font-bold tracking-widest text-gray-600 uppercase bg-[#151d2b] border-y border-[#2a3441]/50 mt-1 first:mt-0"
                            >
                              {cat === 'SDD'
                                ? 'Spec-Driven Development'
                                : cat === 'MCP'
                                  ? 'MCP Tools'
                                  : cat === 'Skills'
                                    ? 'Skills'
                                    : 'UX / UI'}
                            </div>,
                            // Commands in category
                            ...grouped[cat].map((opt) => {
                              const flatIndex = filtered.findIndex((s) => s.cmd === opt.cmd);
                              const isSelected = flatIndex === slashIndex;
                              const IconComponent = iconMap[opt.icon] || TerminalSquare;
                              return (
                                <div
                                  key={opt.cmd}
                                  onClick={() => handleSlashSelect(opt.cmd)}
                                  className={`px-3 py-2.5 cursor-pointer transition-all ${
                                    isSelected
                                      ? 'bg-[#5b8cff]/15 border-l-2 border-[#5b8cff]'
                                      : 'hover:bg-[#253147] border-l-2 border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <IconComponent
                                      className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-[#5b8cff]' : opt.color}`}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`font-mono text-xs font-bold ${
                                            isSelected ? 'text-[#5b8cff]' : opt.color
                                          }`}
                                        >
                                          {opt.cmd}
                                        </span>
                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#253147] text-gray-500 font-mono">
                                          {opt.category}
                                        </span>
                                      </div>
                                      <p
                                        className={`text-xs mt-0.5 leading-relaxed ${
                                          isSelected ? 'text-blue-200/70' : 'text-gray-500'
                                        }`}
                                      >
                                        {opt.description}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            }),
                          ])
                      )}
                    </div>

                    {/* Footer hint */}
                    <div className="px-3 py-1.5 bg-[#111825] border-t border-[#2a3441] flex items-center gap-3">
                      <span className="text-[11px] text-gray-600">
                        <kbd className="px-1 py-0.5 bg-[#1e2a3f] rounded text-gray-500 font-mono">
                          ↑↓
                        </kbd>{' '}
                        navegar
                      </span>
                      <span className="text-[11px] text-gray-600">
                        <kbd className="px-1 py-0.5 bg-[#1e2a3f] rounded text-gray-500 font-mono">
                          Enter
                        </kbd>{' '}
                        seleccionar
                      </span>
                      <span className="text-[11px] text-gray-600">
                        <kbd className="px-1 py-0.5 bg-[#1e2a3f] rounded text-gray-500 font-mono">
                          Esc
                        </kbd>{' '}
                        cerrar
                      </span>
                    </div>
                  </div>
                );
              })()}

            <div className="flex justify-between items-center px-4 pb-3 pt-1">
              <div className="flex items-center gap-3">
                <button
                  className="p-1.5 text-gray-500 hover:text-white bg-[#1e2a3f] rounded-lg transition-colors cursor-pointer"
                  title="Adjuntar Contexto"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-[#182234] border border-[#2a3441]">
                  <Slash className="w-3 h-3 text-[#5b8cff]" />
                  <span className="text-xs text-gray-400 font-mono font-bold tracking-tight uppercase">
                    Agent Teams Lite
                  </span>
                </div>

                {favoriteModels.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#182234] hover:bg-[#1e2a3f] border border-[#2a3441] transition-colors text-xs text-gray-300 font-medium">
                        <Cpu className="w-3.5 h-3.5 text-amber-500" />
                        {activeModelOverride || '🌐 Default Provider Model'}
                        <ChevronDown className="w-3 h-3 opacity-50 ml-1" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="bg-[#111825] border-[#2a3441] text-gray-200 w-[200px]"
                    >
                      <DropdownMenuLabel className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                        Modelos Favoritos ({activeProviderName})
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-[#2a3441]" />
                      <DropdownMenuRadioGroup
                        value={activeModelOverride}
                        onValueChange={setActiveModelOverride}
                      >
                        <DropdownMenuRadioItem
                          value=""
                          className="text-sm cursor-pointer hover:bg-[#1e2a3f] focus:bg-[#1e2a3f]"
                        >
                          Configuración Mágica
                        </DropdownMenuRadioItem>
                        {favoriteModels.map((mId) => (
                          <DropdownMenuRadioItem
                            key={mId}
                            value={mId}
                            className="text-sm cursor-pointer hover:bg-[#1e2a3f] focus:bg-[#1e2a3f]"
                          >
                            {mId}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <button
                onClick={() => handleSend()}
                disabled={!prompt.trim() || isTyping || isWaitingForSubagent}
                className="w-9 h-9 flex items-center justify-center bg-[#5b8cff] text-white rounded-xl hover:bg-[#4676e8] transition-all disabled:bg-[#1a2333] disabled:text-gray-500 shadow-[0_0_15px_rgba(91,140,255,0.2)] disabled:shadow-none"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
