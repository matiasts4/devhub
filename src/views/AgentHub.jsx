'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import {
  Send,
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
  Server,
  Command,
  Settings,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/db/localClient';

const db = createClient();
import ChatInput from '@/components/chat/ChatInput';
import SessionHeader from '@/components/chat/SessionHeader';
import ChatMessageList from '@/components/chat/ChatMessageList';
import { enforceDocOpsGateOnLaunchCommand, shellQuotePrompt } from '@/lib/docopsPrompts';
import { detectMcpOutput } from '@/components/chat/utils/detectMcpOutput';
import { slashCommands, filterSlashCommands, groupByCategory } from '@/lib/slashSkills';

// Phase 4: Trace Enhancement components
import OutputViewerModal from '@/components/chat/OutputViewerModal';
import PermissionModal from '@/components/chat/PermissionModal';
import TokenUsageBadge from '@/components/chat/TokenUsageBadge';
import MCPStatusPanel from '@/components/chat/MCPStatusPanel';
import SessionListModal from '@/components/chat/SessionListModal';
import ChatCommandPalette from '@/components/chat/ChatCommandPalette';
import { useSessionUsage } from '@/hooks/useSessionUsage';
// Phase 5: UX Polish components
import { Skeleton, SkeletonText, SkeletonCard, SkeletonAvatar } from '@/components/chat/Skeleton';
import KeyboardShortcutsHelp from '@/components/chat/KeyboardShortcutsHelp';
import OnboardingTour from '@/components/chat/OnboardingTour';
// Batch D: Terminal Side Panel
// Subagent navigation components
import AgentStatusBar from '@/components/chat/AgentStatusBar';
import SubagentBreadcrumbs from '@/components/chat/SubagentBreadcrumbs';

// UI Components
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
  const location = useLocation();

  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isWaitingForSubagent, setIsWaitingForSubagent] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Streaming optimization: ref-based incremental updates
  // Only the StreamingMessage component re-renders on each chunk
  const streamingContentRef = useRef('');
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const textareaRef = useRef(null);
  const [streamingModel, setStreamingModel] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionUsage, setSessionUsage] = useState({
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  });
  const [isCompressing, setIsCompressing] = useState(false);

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);

  const [llmConfig, setLlmConfig] = useState(null);
  const [activeProviderName, setActiveProviderName] = useState(null);
  const [activeModelOverride, setActiveModelOverride] = useState('');
  const [favoriteModels, setFavoriteModels] = useState([]);
  const [slashFilter, setSlashFilter] = useState(''); // filter text after /

  // Header auto-collapse during agent execution
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const prevWaitingRef = useRef(false);

  useEffect(() => {
    if (isWaitingForSubagent && !prevWaitingRef.current) {
      setHeaderCollapsed(true);
    }
    prevWaitingRef.current = isWaitingForSubagent;
  }, [isWaitingForSubagent]);

  // Load LLM config, detect active provider, and load its favorites
  useEffect(() => {
    fetch('/api/settings/llm-providers')
      .then((res) => res.json())
      .then((data) => {
        setLlmConfig(data);

        // Detect active provider by priority order (first enabled provider wins)
        const priority = data.priorityOrder || ['copilot', 'openrouter', 'zen', 'direct'];
        const providers = data.providers || {};
        let detectedProvider = null;

        for (const name of priority) {
          const p = providers[name];
          if (p && p.enabled !== false) {
            // Check if it has at least some config (API key or model)
            const hasConfig = Object.values(p).some(
              (v) => v && typeof v === 'string' && v.length > 0
            );
            if (hasConfig) {
              detectedProvider = name;
              break;
            }
          }
        }

        if (detectedProvider) {
          setActiveProviderName(detectedProvider);
          // Combine favorites from ALL providers (not just the active one)
          const allFavs = Object.values(data.favoriteModels || {}).flat();
          const uniqueFavs = [...new Set(allFavs)];
          if (uniqueFavs.length > 0) {
            setFavoriteModels(uniqueFavs);
          }
        }
      })
      .catch((err) => console.error('Failed to load LLM config:', err));
  }, []);

  // Load sessions on mount / project change
  useEffect(() => {
    if (project?.id) {
      loadSessions();
    }
  }, [project?.id]); // eslint-disable-line

  // Stale subagent detection — poll health endpoint every 30s
  useEffect(() => {
    const checkStale = async () => {
      try {
        const res = await fetch('/api/agenthub/sessions/health');
        if (!res.ok) return;
        const data = await res.json();
        if (data.aborted_count > 0) {
          // Reload sessions to reflect status changes
          loadSessions();
          // Update any running subagent messages in the UI
          setMessages((prev) =>
            prev.map((m) => {
              if (m.role === 'subagent') {
                try {
                  const meta = m.meta ? JSON.parse(m.meta) : {};
                  if (
                    meta.status === 'running' &&
                    data.stale_sessions.some((s) => s.session_id === m.session_id)
                  ) {
                    return { ...m, meta: JSON.stringify({ ...meta, status: 'aborted' }) };
                  }
                } catch {
                  /* skip — meta parse failure is non-critical */
                }
              }
              return m;
            })
          );
        }
      } catch (err) {
        // Silently fail — health check is non-critical
      }
    };

    const interval = setInterval(checkStale, 30_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  // Phase 4: Trace Enhancement state
  const [traceSearch, setTraceSearch] = useState('');
  const [traceFilterType, setTraceFilterType] = useState('all');
  const [traceFilterStatus, setTraceFilterStatus] = useState('all');
  const [showSessionList, setShowSessionList] = useState(false);
  const [showMCPPanel, setShowMCPPanel] = useState(false);
  const [permissionRequest, setPermissionRequest] = useState(null);
  const [outputViewer, setOutputViewer] = useState({
    isOpen: false,
    title: '',
    content: '',
    language: '',
  });
  const [mcpServers, setMcpServers] = useState([]);

  // Command Palette
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Message editing & UI states
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

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
    await db.from('agent_hub_sessions').insert(newSession);
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setMessages([]);
  };

  // Load sessions list
  const loadSessions = async (forceLoadId = null) => {
    if (!project?.id) return;
    setIsLoadingSessions(true);
    try {
      const { data } = await db
        .from('agent_hub_sessions')
        .select('*')
        .eq('project_id', project.id)
        .order('updated_at', { ascending: false });
      if (data) {
        setSessions(data);

        // Auto-load last active session so state recovers on page switch
        if (!currentSessionId && data.length > 0) {
          const lastId = localStorage.getItem('agenthub_last_session_' + project.id);
          const targetId = forceLoadId || lastId;
          const sessionToLoad = data.find((s) => s.id === targetId) || data[0];
          loadMessages(sessionToLoad.id);
        }
      }
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Load messages for a session + restore traces
  const loadMessages = async (sessionId) => {
    if (!sessionId) return;
    setIsLoadingMessages(true);
    try {
      const { data } = await db
        .from('agent_hub_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      if (data) {
        setMessages(data);
        setCurrentSessionId(sessionId);
        if (project?.id) {
          localStorage.setItem('agenthub_last_session_' + project.id, sessionId);
        }

        // Trust health endpoint for stale detection — do NOT forcibly abort running subagents.
        // Lines 318-354 were removed: running subagents remain running until health confirms stale.
        // The 30s health poll (above) handles stale detection independently.

        // Restore traces for subagent messages
        const subagentMessages = data.filter((m) => m.role === 'subagent');
        if (subagentMessages.length > 0) {
          try {
            const res = await fetch(`/api/agenthub/sessions/${sessionId}/traces`);
            if (res.ok) {
              const allTraces = await res.json();
              const grouped = {};
              for (const t of allTraces) {
                const mid = t.message_id;
                if (mid) {
                  if (!grouped[mid]) grouped[mid] = [];
                  grouped[mid].push(t);
                }
              }
              for (const [mid, parts] of Object.entries(grouped)) {
                tracesRef.current[mid] = parts;
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Update session title with first user message
  const updateSessionTitle = async (sessionId, title) => {
    const truncated = title.length > 50 ? title.substring(0, 50) + '...' : title;
    await db
      .from('agent_hub_sessions')
      .update({ title: truncated, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: truncated } : s)));
  };

  const deleteSession = async (e, id) => {
    e.stopPropagation();
    await db.from('agent_hub_sessions').delete().eq('id', id);
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

    // Build file context prefix if there are attached files
    let fileContextPrefix = '';
    if (attachedFiles.length > 0) {
      fileContextPrefix = attachedFiles
        .map((f) => `\n\n--- FILE: ${f.name} (${f.path}) ---\n\`\`\`\n${f.content}\n\`\`\``)
        .join('\n');
      fileContextPrefix = `[ATTACHED FILES]\nThe following files are attached as context for this conversation:\n${fileContextPrefix}\n\n[END ATTACHED FILES]\n\n`;
    }

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
      await db.from('agent_hub_sessions').insert(newSession);
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
      content: fileContextPrefix + textToSend,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setPrompt('');
    setAttachedFiles([]); // Clear attached files after sending
    setIsTyping(true);

    db
      .from('agent_hub_messages')
      .insert(userMessage)
      .then(() => {
        db
          .from('agent_hub_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId);
      });

    await processLLM([...messages, userMessage], sessionId);
  };

  const handleSendInjection = async (overridePrompt, skipParse = false) => {
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

    await db.from('agent_hub_messages').insert(userMessage);
    await processLLM([...messages, userMessage], currentSessionId, skipParse);
  };

  // ─── Message Editing ────────────────────────────────────────────────────────
  const handleCopyMessage = useCallback(async (m) => {
    try {
      await navigator.clipboard.writeText(m.content || '');
      toast.success('Mensaje copiado');
    } catch {
      toast.error('No se pudo copiar el mensaje');
    }
  }, []);

  const handleStartEdit = useCallback((messageId, content) => {
    setEditingMessageId(messageId);
    setEditDraft(content || '');
  }, []);

  const handleSaveEdit = async (messageId) => {
    if (!editDraft.trim()) return;

    // Find the edited message index
    const editIdx = messages.findIndex((m) => m.id === messageId);
    if (editIdx === -1) return;

    // Truncate messages after the edited one (remove all subsequent messages)
    const truncatedMessages = messages.slice(0, editIdx);

    // Update the edited message content
    const editedMessage = {
      ...messages[editIdx],
      content: editDraft,
    };

    // Delete removed messages from DB
    const removedMessages = messages.slice(editIdx);
    for (const msg of removedMessages) {
      await db.from('agent_hub_messages').delete().eq('id', msg.id);
    }

    // Update the edited message in DB
    await db.from('agent_hub_messages').update({ content: editDraft }).eq('id', messageId);

    // Set state and regenerate
    const newMessages = [...truncatedMessages, editedMessage];
    setMessages(newMessages);
    setEditingMessageId(null);
    setEditDraft('');
    setIsTyping(true);

    await processLLM(newMessages, currentSessionId);
  };

  // ─── Message Regeneration ───────────────────────────────────────────────────
  const handleRegenerate = async (assistantMessageId) => {
    if (isTyping || isStreaming) return;

    // Find the assistant message index
    const regenIdx = messages.findIndex((m) => m.id === assistantMessageId);
    if (regenIdx === -1) return;

    // Find the last user message before this assistant message
    let lastUserMsg = null;
    for (let i = regenIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMsg = messages[i];
        break;
      }
    }

    if (!lastUserMsg) {
      toast.error('No se encontró un mensaje de usuario para regenerar');
      return;
    }

    // Truncate messages after the last user message
    const userMsgIdx = messages.indexOf(lastUserMsg);
    const truncatedMessages = messages.slice(0, userMsgIdx + 1);

    // Delete removed messages from DB
    const removedMessages = messages.slice(userMsgIdx + 1);
    for (const msg of removedMessages) {
      await db.from('agent_hub_messages').delete().eq('id', msg.id);
    }

    setMessages(truncatedMessages);
    setIsTyping(true);

    await processLLM(truncatedMessages, currentSessionId);
  };

  // ─── Stop Generating ────────────────────────────────────────────────────────
  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Flush partial streaming content
    if (streamingContentRef.current) {
      const partialContent = streamingContentRef.current;
      const assistantMsg = {
        id: crypto.randomUUID(),
        session_id: currentSessionId,
        role: 'assistant',
        content: partialContent,
        meta: JSON.stringify({ stopped: true }),
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      db.from('agent_hub_messages').insert(assistantMsg);
    }

    streamingContentRef.current = '';
    setIsStreaming(false);
    setIsTyping(false);
    toast.info('Generación detenida');
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
          keep_last_n: 3,
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

  const processLLM = async (chatMessages, sessionId, skipParse = false) => {
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch('/api/agenthub/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          projectName: project.name,
          session_id: sessionId || currentSessionId || null,
          modelOverride: activeModelOverride || undefined,
          messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortControllerRef.current.signal,
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
              setSessionUsage(
                parsed.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
              );
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

      // Save to DB and parse commands (skip if this is an MCP injection to prevent loops)
      await db.from('agent_hub_messages').insert(finalMessage);
      if (!skipParse) await parseAndExecuteCommands(activeMessage);
    } catch (err) {
      setIsStreaming(false);
      // Don't show error toast if it was an abort (user stopped)
      if (err.name !== 'AbortError') {
        toast.error(err.message);
      }
    } finally {
      abortControllerRef.current = null;
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
        // skipParse=true para evitar loop: respuesta MCP → LLM → otro execute_engram → loop
        handleSendInjection(inyectedOutput, true);
      } catch (e) {
        toast.error(`Fallo de red llamando a MCP: ${e.message}`);
        handleSendInjection(
          `[Error del Sistema Engram]:\nEl servidor local falló al conectar o ejecutar la herramienta: ${e.message}`,
          true
        );
      } finally {
        setIsWaitingForSubagent(false);
      }
    }
  };

  const subagentAbortControllerRef = useRef(null);
  const subagentSessionIdRef = useRef(null);

  // ── Trace state: map from subagentMsgId → array of trace parts ─────────
  // ── Traces: ref para acumulación sin re-render + RAF sync a ~60fps ──────
  const tracesRef = useRef({});
  const isMountedRef = useRef(true);
  const [tracesMap, setTracesMap] = useState({});

  // Track mounted state for cleanup of async operations
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clean up any active poll interval on unmount
      if (subagentAbortControllerRef.current?.abort) {
        subagentAbortControllerRef.current.abort();
      }
    };
  }, []);

  // RAF loop — sincroniza tracesRef → tracesMap a ~60fps (sin re-render por cada SSE)
  useEffect(() => {
    let raf;
    let lastSnap = '';
    const sync = () => {
      const snap = JSON.stringify(Object.keys(tracesRef.current));
      // Only re-render when trace keys actually changed
      if (snap !== lastSnap) {
        setTracesMap({ ...tracesRef.current });
        lastSnap = snap;
      }
      raf = requestAnimationFrame(sync);
    };
    raf = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Global SSE subscription for real-time trace updates ──────────────────
  useEffect(() => {
    let es = null;
    let retryTimer = null;
    let retryCount = 0;
    const connect = () => {
      if (es) {
        es.close();
        es = null;
      }
      try {
        es = new EventSource('/api/agenthub/sessions/stream');
        es.addEventListener('trace-event', (e) => {
          let data;
          try {
            data = JSON.parse(e.data);
          } catch {
            return;
          }
          for (const t of data.traces || []) {
            if (t.message_id && tracesRef.current[t.message_id] !== undefined) {
              upsertTracePart(t.message_id, {
                id: t.part_id || t.id,
                type: t.trace_type || 'tool',
                toolName: t.tool_name,
                toolStatus: t.tool_status,
                toolInput: t.tool_input,
                toolOutput: t.tool_output,
                content: t.content,
                timeStart: t.time_start,
                timeEnd: t.time_end,
                agentName: t.agent_name,
              });
            }
          }
        });
        es.onopen = () => {
          retryCount = 0;
        };
        es.onerror = () => {
          es.close();
          es = null;
          if (retryCount < 10) {
            retryCount++;
            retryTimer = setTimeout(connect, Math.min(1000 * Math.pow(2, retryCount), 30000));
          }
        };
      } catch {
        /* EventSource not supported */
      }
    };
    connect();
    return () => {
      if (es) es.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  // Upsert a part into a trace by its id — muta el ref DIRECTAMENTE (sin setState)
  const upsertTracePart = (msgId, part) => {
    const existing = tracesRef.current[msgId] || [];
    const idx = existing.findIndex((p) => p.id === part.id);
    tracesRef.current = {
      ...tracesRef.current,
      [msgId]:
        idx >= 0
          ? existing.map((p, i) => (i === idx ? { ...p, ...part } : p))
          : [...existing, part],
    };
  };

  const appendTracePart = (msgId, part) => {
    tracesRef.current = {
      ...tracesRef.current,
      [msgId]: [...(tracesRef.current[msgId] || []), part],
    };
  };

  const updateLastTextPart = (msgId, delta) => {
    const existing = [...(tracesRef.current[msgId] || [])];
    const lastText = [...existing].reverse().find((p) => p.type === 'text');
    if (lastText) {
      tracesRef.current = {
        ...tracesRef.current,
        [msgId]: existing.map((p) =>
          p.id === lastText.id ? { ...p, content: p.content + delta } : p
        ),
      };
    } else {
      // No text part yet — crear uno
      const newPart = { id: crypto.randomUUID(), type: 'text', content: delta };
      tracesRef.current = {
        ...tracesRef.current,
        [msgId]: [...existing, newPart],
      };
    }
  };

  const dispatchOpenCode = async (selectedAgent, commandPrompt) => {
    setIsWaitingForSubagent(true);
    let sessionID = null;
    let subagentMsgId = null;
    let childSessionId = null;

    try {
      // Generate message ID upfront — passed to backend for trace linkage
      subagentMsgId = crypto.randomUUID();

      // POST to headless — server handles SSE consumption + persistence in background
      const res = await fetch('/api/agenthub/headless', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: selectedAgent,
          prompt: `[Tú eres el sub-agente. Instrucciones: "${commandPrompt}"]`,
          subagentMsgId,
          project_id: project.id,
        }),
      });

      if (!res.ok) {
        throw new Error('Fallo al conectar con OpenCode Headless');
      }

      const data = await res.json();
      sessionID = data.sessionID;
      subagentSessionIdRef.current = sessionID;

      // Create child session in DB with parent_id for hierarchy navigation
      const childRes = await fetch('/api/agenthub/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          title: `${selectedAgent}: ${commandPrompt.slice(0, 40)}${commandPrompt.length > 40 ? '…' : ''}`,
          agent_model: selectedAgent,
          parent_id: currentSessionId,
          opencode_session_id: sessionID,
        }),
      });
      if (childRes.ok) {
        const childData = await childRes.json();
        childSessionId = childData.id;
      }

      // Create the subagent message — traces come via global SSE stream
      const subagentMessage = {
        id: subagentMsgId,
        session_id: currentSessionId,
        role: 'subagent',
        content: '',
        meta: JSON.stringify({
          agentProfile: selectedAgent,
          status: 'running',
          sessionId: sessionID,
          childSessionId,
        }),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, subagentMessage]);
      tracesRef.current = { ...tracesRef.current, [subagentMsgId]: [] };
      await db.from('agent_hub_messages').insert(subagentMessage);

      // No reader.read() loop — server handles SSE in background.
      // Real-time traces arrive via global SSE subscription (see useEffect below).
      // Poll for completion via health endpoint + periodic status check.

      // Clear any previous interval before creating a new one
      if (subagentAbortControllerRef.current?.abort) {
        subagentAbortControllerRef.current.abort();
      }

      const pollInterval = setInterval(async () => {
        if (!isMountedRef.current) {
          clearInterval(pollInterval);
          return;
        }
        try {
          const healthRes = await fetch('/api/agenthub/sessions/health');
          if (!healthRes.ok) return;
          const health = await healthRes.json();
          // Check if our session is still active
          const isActive = health.active_sessions?.some(
            (s) => s.session_id === sessionID && !s.is_stale
          );
          if (!isActive) {
            // Session completed — check if it was success or error
            const isStale = health.stale_sessions?.some((s) => s.session_id === sessionID);
            const finalStatus = isStale ? 'aborted' : 'success';
            const finalMeta = JSON.stringify({
              agentProfile: selectedAgent,
              status: finalStatus,
              sessionId: sessionID,
              childSessionId,
            });
            setMessages((prev) =>
              prev.map((m) => (m.id === subagentMsgId ? { ...m, meta: finalMeta } : m))
            );
            await db
              .from('agent_hub_messages')
              .update({ meta: finalMeta })
              .eq('id', subagentMsgId);
            if (childSessionId) {
              try {
                await fetch(`/api/agenthub/sessions/${childSessionId}/status`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    status: finalStatus === 'success' ? 'completed' : finalStatus,
                  }),
                });
              } catch {}
            }
            if (finalStatus === 'success') {
              handleSendInjection(
                `[SYSTEM NOTIFICATION]: El sub-agente headless "${selectedAgent}" ha finalizado su ejecución.`
              );
            }
            clearInterval(pollInterval);
            setIsWaitingForSubagent(false);
            subagentAbortControllerRef.current = null;
          }
        } catch {
          // Poll error — non-critical, keep polling
        }
      }, 5000);

      // Store interval ref for cleanup
      subagentAbortControllerRef.current = { abort: () => clearInterval(pollInterval) };
    } catch (e) {
      const errorMeta = JSON.stringify({
        agentProfile: selectedAgent,
        status: 'error',
        sessionId: sessionID,
        childSessionId,
      });
      if (subagentMsgId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === subagentMsgId ? { ...m, meta: errorMeta } : m))
        );
        db
          .from('agent_hub_messages')
          .update({ meta: errorMeta })
          .eq('id', subagentMsgId)
          .catch(() => {});
      }
      if (childSessionId) {
        try {
          await fetch(`/api/agenthub/sessions/${childSessionId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'error' }),
          });
        } catch {}
      }
      toast.error(`Headless Error: ${e.message}`);
      handleSendInjection(`[Error]: Fallo al conectar con el sub-agente: ${e.message}`);
      setIsWaitingForSubagent(false);
      subagentAbortControllerRef.current = null;
    }
  };

  const cancelSubagent = async () => {
    const sessionId = subagentSessionIdRef.current;

    // 1. Tell OpenCode to abort via Next.js API (uses correct server-side port)
    if (sessionId) {
      try {
        const res = await fetch(`/api/agenthub/sessions/${sessionId}/abort`, {
          method: 'POST',
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          console.warn('Abort failed:', errJson.error || res.statusText);
          toast.warning('No se pudo detener el sub-agente remotamente');
        }
      } catch (e) {
        console.warn('Abort request failed:', e.message);
        toast.warning('Error al conectar con el servidor para detener el sub-agente');
      }
    }

    // 2. Abort the client-side SSE stream
    if (subagentAbortControllerRef.current) {
      subagentAbortControllerRef.current.abort();
      subagentAbortControllerRef.current = null;
    }

    // 3. Clear state
    subagentSessionIdRef.current = null;
    setIsWaitingForSubagent(false);
  };

  // Phase 4: Permission handlers — use Next.js API route (correct server-side port)
  const handlePermissionApprove = useCallback(
    async (permId) => {
      if (permissionRequest?.sessionId) {
        try {
          const res = await fetch(
            `/api/agenthub/sessions/${permissionRequest.sessionId}/permissions/${permId}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'approve' }),
            }
          );
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            console.warn('Permission approve failed:', errJson.error || res.statusText);
            toast.warning('No se pudo aprobar el permiso');
          }
        } catch (e) {
          console.warn('Permission approve request failed:', e.message);
          toast.warning('Error al aprobar el permiso');
        }
      }
      setPermissionRequest(null);
    },
    [permissionRequest]
  );

  const handlePermissionReject = useCallback(
    async (permId) => {
      if (permissionRequest?.sessionId) {
        try {
          const res = await fetch(
            `/api/agenthub/sessions/${permissionRequest.sessionId}/permissions/${permId}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'reject' }),
            }
          );
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            console.warn('Permission reject failed:', errJson.error || res.statusText);
            toast.warning('No se pudo rechazar el permiso');
          }
        } catch (e) {
          console.warn('Permission reject request failed:', e.message);
          toast.warning('Error al rechazar el permiso');
        }
      }
      setPermissionRequest(null);
    },
    [permissionRequest]
  );

  // Phase 4: Trace filter handlers
  const handleTraceSearch = useCallback((term) => {
    setTraceSearch(term);
  }, []);

  const handleTraceFilter = useCallback((filters) => {
    if (filters.trace_type) setTraceFilterType(filters.trace_type);
    if (filters.tool_status) setTraceFilterStatus(filters.tool_status);
    if (filters.tool_name) setTraceFilterStatus(filters.tool_name); // reuse status filter
  }, []);

  const handleTraceClear = useCallback(() => {
    setTraceSearch('');
    setTraceFilterType('all');
    setTraceFilterStatus('all');
  }, []);

  // Phase 4: MCP server refresh
  const handleMCPRefresh = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/servers');
      if (res.ok) {
        const data = await res.json();
        setMcpServers(data);
      }
    } catch {
      // MCP endpoint may not exist yet
    }
  }, []);

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
      if (filtered.length > 0) {
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
      } else {
        // If no matching commands, pressing Enter or Tab should just default behave (or we can close menu)
        if (e.key === 'Enter' && !e.shiftKey) {
          setShowSlashMenu(false);
          // Fallthrough to normal Enter behavior
        }
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

  // Phase 5: Global keyboard shortcuts (Ctrl+? for help, Ctrl+N for new session)
  useEffect(() => {
    const handler = (e) => {
      // Ctrl+? — Keyboard shortcuts help
      if (e.key === '?' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShowShortcutsHelp((prev) => !prev);
        return;
      }
      // Ctrl+N — New session
      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
        if (
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA'
        ) {
          e.preventDefault();
          createNewSession();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line
  const currentSession = sessions.find((s) => s.id === currentSessionId);

  return (
    <div
      className="flex flex-col h-full text-gray-200 overflow-hidden"
      style={{ background: 'var(--surface-app)' }}
    >
      {/* Collapsible Header — auto-hides during agent execution */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          headerCollapsed ? 'max-h-0 opacity-0' : 'max-h-40 opacity-100'
        }`}
      >
        <SessionHeader
          currentSession={currentSession}
          sessions={sessions}
          currentSessionId={currentSessionId}
          mergedUsage={sessionUsage}
          showMCPPanel={showMCPPanel}
          isCompressing={isCompressing}
          messagesCount={messages.length}
          onToggleMCP={() => setShowMCPPanel((v) => !v)}
          onCompress={handleCompressContext}
          onShowSessionList={() => setShowSessionList(true)}
          onLoadSession={loadMessages}
          onDeleteSession={deleteSession}
          onCreateSession={createNewSession}
        />
      </div>

      {/* Minimal expand bar — shown only when header is collapsed */}
      {headerCollapsed && (
        <div
          className="flex items-center justify-between px-3 py-1 border-b"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-card)' }}
        >
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400/70">
              Agente ejecutando
            </span>
          </div>
          <button
            onClick={() => setHeaderCollapsed(false)}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            title="Expandir header"
          >
            <ChevronDown className="w-3 h-3" />
            Expandir
          </button>
        </div>
      )}

      {isLoadingSessions || (isLoadingMessages && messages.length === 0) ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-8" role="status" aria-live="polite">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center gap-3">
              <SkeletonAvatar size={34} />
              <Skeleton className="h-4 w-40" />
            </div>
            <SkeletonCard />
            <SkeletonCard />
            <div className="pt-1">
              <SkeletonText lines={3} />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Breadcrumbs de navegación jerárquica */}
          <SubagentBreadcrumbs
            chain={[]}
            currentSessionId={currentSessionId}
            onNavigate={(sessionId) => loadMessages(sessionId)}
          />

          <ChatMessageList
            messages={messages}
            tracesMap={tracesMap}
            isTyping={isTyping}
            isWaitingForSubagent={isWaitingForSubagent}
            isStreaming={isStreaming}
            streamingContentRef={streamingContentRef}
            streamingModel={streamingModel}
            messagesEndRef={messagesEndRef}
            editingMessageId={editingMessageId}
            editDraft={editDraft}
            onEditChange={setEditDraft}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={() => {
              setEditingMessageId(null);
              setEditDraft('');
            }}
            onRegenerate={handleRegenerate}
            onCopyMessage={handleCopyMessage}
            onStartEdit={handleStartEdit}
            onCancelSubagent={cancelSubagent}
            onSetPrompt={setPrompt}
            formatMessage={formatMessage}
            detectMcpOutput={detectMcpOutput}
            onViewSubagent={(sa) => {
              // Navigate to subagent session if it has a sessionId
              if (sa.sessionId) {
                // TODO: load subagent session
                toast.info(`Navegando a subagente: ${sa.agentProfile}`);
              }
            }}
            onViewSubagentInContext={(subagentMsg) => {
              // Open subagent in dedicated view (SwarmControl)
              navigate(`/agent/swarm`);
              toast.info(
                `Abriendo ${subagentMsg.meta ? JSON.parse(subagentMsg.meta).agentProfile : 'subagente'} en Swarm Control`
              );
            }}
          />

          <ChatInput
            isWaitingForSubagent={isWaitingForSubagent}
            isTyping={isTyping}
            isStreaming={isStreaming}
            prompt={prompt}
            textareaRef={textareaRef}
            showSlashMenu={showSlashMenu}
            slashFilter={slashFilter}
            slashIndex={slashIndex}
            favoriteModels={favoriteModels}
            activeModelOverride={activeModelOverride}
            activeProviderName={activeProviderName}
            abortControllerRef={abortControllerRef}
            onPromptChange={handlePromptChange}
            onKeyDown={handleKeyDown}
            onSlashSelect={handleSlashSelect}
            onOpenCommandPalette={() => setShowCommandPalette(true)}
            onModelOverrideChange={setActiveModelOverride}
            onStopGenerating={handleStopGenerating}
            onSend={handleSend}
          />

          {/* AgentStatusBar — debajo del input, al pie absoluto (OpenCode style) */}
          {(() => {
            const isActive = isWaitingForSubagent || isTyping || isStreaming;
            if (!isActive) return null;

            const runningSubagent = messages.findLast?.((m) => {
              try {
                return m.role === 'subagent' && JSON.parse(m.meta || '{}').status === 'running';
              } catch {
                return false;
              }
            });

            let agentName = 'Orquestador';
            // Para el modelo: preferir el del subagente activo, luego streaming, luego override
            let agentModel = streamingModel || activeModelOverride || '';
            let toolCallCount = 0;

            if (runningSubagent) {
              let meta = {};
              try {
                meta = JSON.parse(runningSubagent.meta || '{}');
              } catch {}
              agentName = meta.agentProfile
                ? meta.agentProfile
                    .replace(/^openai\/|^anthropic\/|^google\//i, '')
                    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
                : 'Sub-Agente';
              // El modelo del subagente viene del meta (guardado por el dispatch)
              if (meta.model) agentModel = meta.model;
              const trace = tracesMap?.[runningSubagent.id] || [];
              toolCallCount = trace.filter((p) => p.type === 'tool').length;
            }

            return (
              <AgentStatusBar
                isActive={isActive}
                agentName={agentName}
                model={agentModel}
                tokenCount={sessionUsage?.total_tokens || 0}
                tokenLimit={200000}
                toolCallCount={toolCallCount}
                onInterrupt={handleStopGenerating}
                onCommandPalette={() => setShowCommandPalette(true)}
              />
            );
          })()}

          {/* Phase 4: Session List Modal */}
          <SessionListModal
            isOpen={showSessionList}
            onClose={() => setShowSessionList(false)}
            sessions={sessions}
            onSelect={(s) => loadMessages(s.id)}
            projectId={project?.id}
            onCreateNew={createNewSession}
          />

          {/* Command Palette (Ctrl+K) */}
          <ChatCommandPalette
            open={showCommandPalette}
            onOpenChange={setShowCommandPalette}
            sessions={sessions}
            onSelectSession={(sessionId) => loadMessages(sessionId)}
            onCreateNew={createNewSession}
            onInsertCommand={(cmd) => setPrompt((prev) => prev + cmd + ' ')}
            onNavigate={(path) => navigate(path)}
          />

          {/* Phase 4: Permission Modal */}
          <PermissionModal
            isOpen={!!permissionRequest}
            onClose={() => setPermissionRequest(null)}
            onApprove={handlePermissionApprove}
            onReject={handlePermissionReject}
            permission={permissionRequest}
          />

          {/* Phase 4: Output Viewer Modal */}
          <OutputViewerModal
            isOpen={outputViewer.isOpen}
            onClose={() => setOutputViewer({ isOpen: false, title: '', content: '', language: '' })}
            title={outputViewer.title}
            content={outputViewer.content}
            language={outputViewer.language}
          />

          {/* Phase 4: MCP Status Panel (slide-in drawer) */}
          {showMCPPanel && (
            <div
              className="fixed inset-y-0 right-0 z-40 w-full sm:w-80 border-l shadow-2xl animate-in slide-in-from-right duration-200"
              style={{ background: 'var(--surface-app)', borderColor: 'var(--border-subtle)' }}
            >
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <h3
                  className="text-sm font-semibold flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Server className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                  MCP Servers
                </h3>
                <button
                  onClick={() => setShowMCPPanel(false)}
                  className="p-1.5 rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Cerrar panel MCP"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--surface-hover)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  }}
                >
                  <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
                </button>
              </div>
              <div className="p-3 overflow-y-auto max-h-[calc(100vh-50px)]">
                <MCPStatusPanel servers={mcpServers} onRefresh={handleMCPRefresh} />
              </div>
            </div>
          )}

          <KeyboardShortcutsHelp
            isOpen={showShortcutsHelp}
            onClose={() => setShowShortcutsHelp(false)}
          />

          <OnboardingTour isActive={showOnboarding} onComplete={() => setShowOnboarding(false)} />
        </>
      )}
    </div>
  );
}
