'use client';

import {
  Loader2,
  Slash,
  Cpu,
  ChevronDown,
  CheckSquare,
  Monitor,
  Server,
  Activity,
  LayoutPanelLeft,
  ExternalLink,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ChatInput from '@/components/chat/ChatInput';
import AgentHubHeader from '@/components/chat/AgentHubHeader';
import ChatMessageList from '@/components/chat/ChatMessageList';
import OutputViewerModal from '@/components/chat/OutputViewerModal';
import PermissionModal from '@/components/chat/PermissionModal';
import TokenUsageBadge from '@/components/chat/TokenUsageBadge';
import MCPStatusPanel from '@/components/chat/MCPStatusPanel';
import SessionListModal from '@/components/chat/SessionListModal';
import ChatCommandPalette from '@/components/chat/ChatCommandPalette';
import { Skeleton, SkeletonCard, SkeletonAvatar } from '@/components/chat/Skeleton';
import KeyboardShortcutsHelp from '@/components/chat/KeyboardShortcutsHelp';
import OnboardingTour from '@/components/chat/OnboardingTour';
import AgentStatusBar from '@/components/chat/AgentStatusBar';
import SubagentBreadcrumbs from '@/components/chat/SubagentBreadcrumbs';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import { sileo } from 'sileo';
import remarkGfm from 'remark-gfm';
import { createClient } from '@/lib/db/localClient';

const db = createClient();
import { detectMcpOutput } from '@/components/chat/utils/detectMcpOutput';
import { dispatchOperationalNotification } from '@/lib/operations/notify';
import { filterSlashCommands } from '@/lib/slashSkills';
import { createAgentHubStreamParser } from '@/lib/agenthubStream';
import {
  DEFAULT_COMPRESSION_KEEP_LAST_N,
  formatCompressionResultMessage,
  MIN_MESSAGES_FOR_COMPRESSION,
} from '@/lib/agenthubCompression';

// Phase 4: Trace Enhancement components
import { useSessionUsage } from '@/hooks/useSessionUsage';
import { mergeSessionUsage } from '@/lib/agenthub/contextUsage';
import {
  getSubagentFinalStatusFromChild,
  isStaleSessionForSubagentMessage,
  getSubagentMeta,
  normalizeSubagentName,
} from '@/lib/agenthubSubagentState';
import { emitSubagentOperationalFeedback } from '@/lib/operations/agenthubFeedback';

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
  const [activeModelOverride, setActiveModelOverride] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('agenthub_model_override') || '';
    }
    return '';
  });

  // Persist model override to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('agenthub_model_override', activeModelOverride);
    }
  }, [activeModelOverride]);
  const [favoriteModels, setFavoriteModels] = useState([]);
  const [slashFilter, setSlashFilter] = useState(''); // filter text after /

  // Header auto-collapse during agent execution
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  // Right panel view mode: 'live' = Markdown-rendered OC output, 'traces' = structured trace list
  const [rightPanelView, setRightPanelView] = useState('live');
  const prevWaitingRef = useRef(false);
  const subagentRunRef = useRef(null);

  // Chat panel width (drag-resizable)
  const [chatWidth, setChatWidth] = useState(() => {
    try {
      return parseInt(localStorage.getItem('agenthub_chat_width') || '380', 10);
    } catch {
      return 380;
    }
  });
  const dragStateRef = useRef({ isDragging: false, startX: 0, startWidth: 0 });

  // Live view: OC message data fetched directly from OpenCode HTTP API.
  // childSessionIds accumulates ALL subagent session IDs for the current chat — never reset on
  // each new dispatch so the Live panel shows cumulative history within a conversation.
  const [childSessionIds, setChildSessionIds] = useState([]);
  const [ocMessages, setOcMessages] = useState([]);
  const ocPollRef = useRef(null);
  const ocLiveScrollRef = useRef(null);
  const ocLiveIsAtBottomRef = useRef(true);

  const resetSubagentUiState = useCallback(() => {
    setIsWaitingForSubagent(false);
    setHeaderCollapsed(false);
    prevWaitingRef.current = false;
    if (subagentAbortControllerRef.current?.abort) {
      subagentAbortControllerRef.current.abort();
    }
    subagentAbortControllerRef.current = null;
    subagentSessionIdRef.current = null;
  }, []);

  const updateSubagentMessageState = useCallback(async (subagentMsgId, nextMeta) => {
    const metaString = JSON.stringify(nextMeta);
    setMessages((prev) =>
      prev.map((m) => (m.id === subagentMsgId ? { ...m, meta: metaString } : m))
    );
    try {
      await db.from('agent_hub_messages').update({ meta: metaString }).eq('id', subagentMsgId);
    } catch {
      // Non-critical local persistence failure.
    }
  }, []);

  const finalizeSubagentRun = useCallback(
    async ({
      subagentMsgId,
      selectedAgent,
      sessionID,
      childSessionId,
      status,
      errorMessage,
      traces = [],
      textOutput = '',
    }) => {
      const terminalStatus = status === 'success' ? 'completed' : status;
      let feedback = null;

      if (childSessionId) {
        try {
          await fetch(`/api/agenthub/sessions/${childSessionId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: terminalStatus }),
          });
        } catch {
          // Child status sync best effort only.
        }
      }

      if (subagentMsgId) {
        await updateSubagentMessageState(subagentMsgId, {
          agentProfile: selectedAgent,
          status,
          sessionId: sessionID,
          childSessionId,
          ...(errorMessage ? { errorMessage } : {}),
        });
      }

      try {
        feedback = await emitSubagentOperationalFeedback({
          projectId: project?.id,
          agentName: selectedAgent,
          status,
          sessionID,
          childSessionId,
          messageId: subagentMsgId,
          errorMessage,
          traces,
          textOutput,
        });
      } catch (notificationError) {
        console.warn('Failed to emit operational feedback:', notificationError);
      }

      resetSubagentUiState();
      subagentRunRef.current = null;
      return feedback;
    },
    [project?.id, resetSubagentUiState, updateSubagentMessageState]
  );

  const clearStaleSubagentMessages = useCallback((staleSessions) => {
    if (!Array.isArray(staleSessions) || staleSessions.length === 0) return;
    const run = subagentRunRef.current;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.role !== 'subagent') return m;
        if (
          !staleSessions.some((staleSession) => isStaleSessionForSubagentMessage(staleSession, m))
        ) {
          return m;
        }
        const meta = getSubagentMeta(m);
        if (meta.status !== 'running') return m;
        return {
          ...m,
          meta: JSON.stringify({
            ...meta,
            status: 'aborted',
          }),
        };
      })
    );

    if (
      run &&
      staleSessions.some((staleSession) => staleSession.session_id === run.childSessionId)
    ) {
      resetSubagentUiState();
      subagentRunRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isWaitingForSubagent && !prevWaitingRef.current) {
      setHeaderCollapsed(true);
    }
    prevWaitingRef.current = isWaitingForSubagent;
  }, [isWaitingForSubagent]);

  // Lifecycle OpenCode Start/Stop
  useEffect(() => {
    fetch('/api/agenthub/opencode/start', { method: 'POST' }).catch((err) =>
      console.error('Failed to start OpenCode:', err)
    );

    const handleBeforeUnload = () => {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/agenthub/opencode/stop');
      } else {
        fetch('/api/agenthub/opencode/stop', { method: 'POST', keepalive: true }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

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

  // Auto-kickoff Planning mode when ?plan=1 is in the URL
  const planningAutoStartedRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.get('plan') || planningAutoStartedRef.current || !project?.id) return;

    // Small delay to ensure sessions + LLM config are initialized
    const timer = setTimeout(() => {
      planningAutoStartedRef.current = true;
      // Clean the URL query param without navigation
      window.history.replaceState({}, '', location.pathname);

      const kickoff = `Estoy creando un nuevo proyecto en DevHub y necesito que me ayudes con la **planificación completa**.

Por favor, seguí este flujo:
1. Usá \`execute_devhub\` con \`get_project_context\` (project_id: "${project.id}") para leer el contexto, los documentos y el planning_prompt que ya cargué
2. Haceme las preguntas que necesites para entender bien qué quiero construir (alcance, tecnologías, prioridades)
3. Una vez que quede claro el alcance, armá un plan exhaustivo: creá los **hitos** (milestones) y las **tareas** usando las herramientas MCP de DevHub
4. Al terminar, marcá el proyecto como planificado con \`update_project\` usando \`planning_status: "completed"\`

Dale, empezá leyendo el contexto del proyecto.`;

      handleSend(kickoff);
    }, 600);

    return () => clearTimeout(timer);
  }, [project?.id, location.search]); // eslint-disable-line

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
          clearStaleSubagentMessages(data.stale_sessions || []);
        }
      } catch (err) {
        // Silently fail — health check is non-critical
      }
    };

    const interval = setInterval(checkStale, 30_000);
    return () => clearInterval(interval);
  }, [clearStaleSubagentMessages]);

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

        // Auto-load last active session so state recovers on page switch.
        // Uses sessionStorage (not localStorage) so a fresh browser/tab start always
        // begins with a new session instead of restoring the last one.
        if (!currentSessionId && data.length > 0) {
          const lastId = sessionStorage.getItem('agenthub_last_session_' + project.id);
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
    setSessionUsage({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
    // Clear accumulated Live view state from previous chat
    setChildSessionIds([]);
    setOcMessages([]);
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
          sessionStorage.setItem('agenthub_last_session_' + project.id, sessionId);
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
          } catch {
            // Ignore trace hydration failures for partial history.
          }
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

    db.from('agent_hub_messages')
      .insert(userMessage)
      .then(() => {
        db.from('agent_hub_sessions')
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
      sileo.success({ title: 'Mensaje copiado' });
    } catch {
      sileo.error({ title: 'No se pudo copiar el mensaje' });
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
      sileo.error({ title: 'No se encontró un mensaje de usuario para regenerar' });
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
    sileo.info({ title: 'Generación detenida' });
  };

  const handleCompressContext = async () => {
    if (!currentSessionId || isCompressing || messages.length < MIN_MESSAGES_FOR_COMPRESSION)
      return;

    setIsCompressing(true);

    try {
      await sileo.promise(
        (async () => {
          const res = await fetch('/api/agenthub/compress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: currentSessionId,
              project_id: project?.id,
              model: activeModelOverride || 'gpt-4o-mini',
              keep_last_n: DEFAULT_COMPRESSION_KEEP_LAST_N,
            }),
          });

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error || 'Error comprimiendo');
          }

          const result = await res.json();
          await loadMessages(currentSessionId);
          return result;
        })(),
        {
          loading: { title: 'Comprimiendo espacio de contexto...' },
          success: (result) => ({
            title: formatCompressionResultMessage(result),
          }),
          error: (e) => ({
            title: `Error de compresión: ${e.message}`,
          }),
        }
      );
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
      const handleStreamEvent = (parsed) => {
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
          streamingContentRef.current = activeMessage;
        }
      };

      const parser = createAgentHubStreamParser({
        onEvent: handleStreamEvent,
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        parser.push(decoder.decode(value, { stream: true }));
      }

      parser.push(decoder.decode());
      parser.flush();

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

      // Disparar notificación operacional cuando el agente finaliza su respuesta
      dispatchOperationalNotification({
        title: `Respuesta de Agente Finalizada`,
        body: activeMessage.slice(0, 150) + (activeMessage.length > 150 ? '...' : ''),
        category: 'agents',
        severity: 'success',
        source: 'agenthub',
        entity_id: sessionId,
        dedupe_key: `agenthub:turn:${assistantMessageId}`,
        actions: [
          { label: 'Ver Chat', action_type: 'navigate', target: `/agenthub?session=${sessionId}` },
        ],
      });

      if (!skipParse) await parseAndExecuteCommands(activeMessage);
    } catch (err) {
      setIsStreaming(false);
      // Don't show error toast if it was an abort (user stopped)
      if (err.name !== 'AbortError') {
        sileo.error({ title: err.message });
        dispatchOperationalNotification({
          title: `Error en Respuesta de Agente`,
          body: err.message || 'Error inesperado durante la generación.',
          category: 'agents',
          severity: 'critical',
          source: 'agenthub',
          entity_id: sessionId,
          dedupe_key: `agenthub:error:${sessionId}:${Date.now()}`,
        });
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
      const agentProfile = normalizeSubagentName(matchOpenCode[1]);
      const agentGoal = matchOpenCode[2].trim();
      sileo.info({ title: `Delegando tarea a: ${agentProfile}` });
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
        sileo.error({ title: 'Error al parsear argumentos de Engram (JSON inválido)' });
        return;
      }

      sileo.info({ title: `MCP: Ejecutando Engram -> ${toolName}` });
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
        sileo.error({ title: `Fallo de red llamando a MCP: ${e.message}` });
        handleSendInjection(
          `[Error del Sistema Engram]:\nEl servidor local falló al conectar o ejecutar la herramienta: ${e.message}`,
          true
        );
      } finally {
        setIsWaitingForSubagent(false);
      }
      return;
    }

    // 3. Interceptar Herramientas de DevHub (DevHub MCP)
    const matchDevHub = replyContent.match(
      /<execute_devhub tool="([^"]+)" args='(.*?)'><\/execute_devhub>/is
    );
    if (matchDevHub) {
      const toolName = matchDevHub[1];
      let args = {};
      try {
        args = JSON.parse(matchDevHub[2]);
      } catch (e) {
        sileo.error({ title: 'Error al parsear argumentos de DevHub MCP (JSON inválido)' });
        return;
      }

      sileo.info({ title: `MCP: Ejecutando DevHub -> ${toolName}` });
      setIsWaitingForSubagent(true);

      try {
        const res = await fetch('/api/mcp/devhub', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolName, args }),
        });

        if (!res.ok) {
          const textData = await res.text();
          throw new Error(textData);
        }

        const mcpResult = await res.json();

        let inyectedOutput = `[Respuesta del Sistema DevHub MCP - ${toolName}]:\n${mcpResult.content || 'Sin resultados'}`;
        if (mcpResult.error || mcpResult.success === false) {
          inyectedOutput = `[Error del Sistema DevHub MCP - ${toolName}]:\n${mcpResult.error || mcpResult.content || 'Fallo en la ejecución de la herramienta'}`;
        }

        // skipParse=true para evitar loop
        handleSendInjection(inyectedOutput, true);
      } catch (e) {
        sileo.error({ title: `Fallo de red llamando a DevHub MCP: ${e.message}` });
        handleSendInjection(
          `[Error del Sistema DevHub MCP - ${toolName}]:\nEl servidor local falló al conectar o ejecutar la herramienta: ${e.message}`,
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

    const buildTraceSnap = (traceMap) =>
      Object.entries(traceMap)
        .map(([msgId, parts]) => {
          const list = Array.isArray(parts) ? parts : [];
          const last = list[list.length - 1] || {};
          const contentLen = typeof last.content === 'string' ? last.content.length : 0;
          return `${msgId}:${list.length}:${last.id || ''}:${last.toolStatus || ''}:${contentLen}`;
        })
        .join('|');

    const sync = () => {
      const snap = buildTraceSnap(tracesRef.current);
      // Re-render when trace structure/content changes (not just keys)
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
        es = new EventSource('/api/agenthub/sessions/stream/');
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
    const normalizedAgent = normalizeSubagentName(selectedAgent);
    setIsWaitingForSubagent(true);
    let sessionID = null;
    let subagentMsgId = null;
    let childSessionId = null;

    try {
      // Generate message ID upfront — passed to backend for trace linkage
      subagentMsgId = crypto.randomUUID();

      // POST to headless — server handles SSE consumption + persistence in background
      // Only forward model if user explicitly selected a fully-qualified 'provider/model' path.
      // Sub-agents have their own model configured in opencode.json — don't override unless explicit.
      const headlessModel = activeModelOverride?.includes('/') ? activeModelOverride : null;
      const res = await fetch('/api/agenthub/headless', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: normalizedAgent,
          prompt: `[Tú eres el sub-agente. Instrucciones: "${commandPrompt}"]`,
          subagentMsgId,
          project_id: project.id,
          ...(headlessModel ? { model: headlessModel } : {}),
        }),
      });

      if (!res.ok) {
        let detail = '';
        try {
          const err = await res.json();
          detail = err?.detail || err?.error || '';
        } catch {
          // Ignore parse errors and keep generic message
        }
        throw new Error(
          detail
            ? `Fallo al conectar con OpenCode Headless: ${detail}`
            : 'Fallo al conectar con OpenCode Headless'
        );
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
          title: `${normalizedAgent}: ${commandPrompt.slice(0, 40)}${commandPrompt.length > 40 ? '…' : ''}`,
          agent_model: normalizedAgent,
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
          agentProfile: normalizedAgent,
          status: 'running',
          sessionId: sessionID,
          childSessionId,
        }),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, subagentMessage]);
      tracesRef.current = { ...tracesRef.current, [subagentMsgId]: [] };
      // Auto-show live Markdown view when a sub-agent starts.
      // Append session ID so the Live panel accumulates history across dispatches in this chat.
      setRightPanelView('live');
      setChildSessionIds((prev) => (prev.includes(sessionID) ? prev : [...prev, sessionID]));
      await db.from('agent_hub_messages').insert(subagentMessage);
      subagentRunRef.current = {
        subagentMsgId,
        selectedAgent: normalizedAgent,
        sessionID,
        childSessionId,
      };

      // No reader.read() loop — server handles SSE in background.
      // Real-time traces arrive via global SSE subscription (see useEffect below).
      // Poll the child session status route — source of truth for completion.

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
          if (!sessionID) return;
          const statusRes = await fetch(`/api/agenthub/sessions/${sessionID}/status`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          const normalizedStatus = getSubagentFinalStatusFromChild(statusData.status);
          if (normalizedStatus === 'running') return;

          const currentTraces = tracesRef.current[subagentMsgId] || [];
          const feedback = await finalizeSubagentRun({
            subagentMsgId,
            selectedAgent: normalizedAgent,
            sessionID,
            childSessionId,
            status: normalizedStatus,
            errorMessage: statusData.error_message || null,
            traces: currentTraces,
            textOutput: statusData.text_output || '',
          });

          if (feedback?.injectionMessage) {
            handleSendInjection(feedback.injectionMessage);
          }
        } catch {
          // Poll error — non-critical, keep polling
        }
      }, 2000);

      // Store interval ref for cleanup
      subagentAbortControllerRef.current = { abort: () => clearInterval(pollInterval) };
    } catch (e) {
      const normalizedAgent = normalizeSubagentName(selectedAgent);
      const errorMeta = JSON.stringify({
        agentProfile: normalizedAgent,
        status: 'error',
        sessionId: sessionID,
        childSessionId,
        errorMessage: e.message,
      });
      if (subagentMsgId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === subagentMsgId ? { ...m, meta: errorMeta } : m))
        );
        db.from('agent_hub_messages')
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
        } catch {
          // Child error sync best effort only.
        }
      }
      sileo.error({ title: `Headless Error: ${e.message}` });
      handleSendInjection(`[Error]: Fallo al conectar con el sub-agente: ${e.message}`);
      resetSubagentUiState();
      subagentRunRef.current = null;
    }
  };

  const cancelSubagent = async () => {
    const run = subagentRunRef.current;
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
          sileo.warning({ title: 'No se pudo detener el sub-agente remotamente' });
        }
      } catch (e) {
        console.warn('Abort request failed:', e.message);
        sileo.warning({ title: 'Error al conectar con el servidor para detener el sub-agente' });
      }
    }

    // 2. Abort the client-side SSE stream
    if (subagentAbortControllerRef.current) {
      subagentAbortControllerRef.current.abort();
      subagentAbortControllerRef.current = null;
    }

    if (run?.subagentMsgId) {
      await updateSubagentMessageState(run.subagentMsgId, {
        agentProfile: run.selectedAgent,
        status: 'aborted',
        sessionId: run.sessionID,
        childSessionId: run.childSessionId,
      });
    }

    // 3. Clear state
    resetSubagentUiState();
    subagentRunRef.current = null;
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
            sileo.warning({ title: 'No se pudo aprobar el permiso' });
          }
        } catch (e) {
          console.warn('Permission approve request failed:', e.message);
          sileo.warning({ title: 'Error al aprobar el permiso' });
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
            sileo.warning({ title: 'No se pudo rechazar el permiso' });
          }
        } catch (e) {
          console.warn('Permission reject request failed:', e.message);
          sileo.warning({ title: 'Error al rechazar el permiso' });
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
      const res = await fetch('/api/agenthub/mcp/status');
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

  // OC Message polling: fetch OpenCode messages from ALL child sessions and merge into a
  // single chronological list. Re-runs whenever a new session ID is added to the array.
  useEffect(() => {
    if (childSessionIds.length === 0) return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const allMessages = [];
        await Promise.all(
          childSessionIds.map(async (sid) => {
            const res = await fetch(`/api/agenthub/sessions/${sid}/opencode-messages`);
            if (res.ok) {
              const data = await res.json();
              allMessages.push(...(data.messages || []));
            }
          })
        );
        // Sort by OpenCode creation timestamp so multi-session history is chronological
        allMessages.sort((a, b) => (a.info?.time?.created || 0) - (b.info?.time?.created || 0));
        if (!cancelled) setOcMessages(allMessages);
      } catch {
        /* non-critical */
      }
    };

    poll();
    ocPollRef.current = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(ocPollRef.current);
      ocPollRef.current = null;
    };
  }, [childSessionIds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll the Live panel to the bottom as new OC messages arrive.
  // Respects manual scroll: if the user scrolled up to read, don't hijack their position.
  useEffect(() => {
    const el = ocLiveScrollRef.current;
    if (!el || !ocLiveIsAtBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [ocMessages.length]);

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
  const { usage: persistedSessionUsage } = useSessionUsage(currentSessionId);
  const mergedSessionUsage = useMemo(() => {
    return mergeSessionUsage(persistedSessionUsage, sessionUsage);
  }, [persistedSessionUsage, sessionUsage]);

  return (
    <div
      className="flex h-full text-gray-200 overflow-hidden"
      style={{ background: 'var(--surface-app)' }}
    >
      {/* ══════════════════════════════════════════════
          LEFT PANEL — Chat (session + messages + input)
          ══════════════════════════════════════════════ */}
      <div
        className="flex flex-col shrink-0 overflow-hidden"
        style={{
          width: chatWidth + 'px',
          minWidth: '260px',
          maxWidth: '680px',
          borderRight: '1px solid var(--border-subtle)',
        }}
      >
        {/* Collapsible Header */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            headerCollapsed ? 'max-h-0 opacity-0' : 'max-h-80 opacity-100'
          }`}
        >
          <AgentHubHeader
            currentSession={currentSession}
            sessions={sessions}
            currentSessionId={currentSessionId}
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

        {/* Minimal expand bar */}
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
            >
              <ChevronDown className="w-3 h-3" />
              Expandir
            </button>
          </div>
        )}

        {/* Messages or skeleton */}
        {isLoadingSessions || (isLoadingMessages && messages.length === 0) ? (
          <div className="flex-1 overflow-y-auto p-4" role="status" aria-live="polite">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <SkeletonAvatar size={34} />
                <Skeleton className="h-4 w-40" />
              </div>
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        ) : (
          <>
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
              compactSubagentTurns={rightPanelView === 'live'}
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
                const panelId = `oc-view-${sa.sessionId || Date.now()}`;
                window.dispatchEvent(
                  new CustomEvent('devhub:run-agent', {
                    detail: {
                      taskId: panelId,
                      command: `opencode`,
                      selectedAgent: sa.agentProfile || 'opencode',
                      promptSummary: `Ver sesión: ${sa.agentProfile || 'Agent'}`,
                      taskTitle: `Ver: ${sa.agentProfile || 'Agent'}`,
                    },
                  })
                );
                navigate(`/project/${project.id}/terminales`);
              }}
              onViewSubagentInContext={(subagentMsg) => {
                // Bug fix 2026-06-03: /agent/swarm is not a declared route in App.js
                // (only /project/:projectId/swarm is). The previous path silently
                // 404'd in production, which the SPA error boundary surfaced as
                // "This page couldn't load". Use the correct nested route.
                if (!project?.id) {
                  sileo.error({ title: 'No hay proyecto activo para abrir Swarm Control.' });
                  return;
                }
                navigate(`/project/${project.id}/swarm`);
                sileo.info({
                  title: `Abriendo ${subagentMsg.meta ? JSON.parse(subagentMsg.meta).agentProfile : 'subagente'} en Swarm Control`,
                });
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
          </>
        )}
      </div>

      {/* ═══════════════ DRAG HANDLE ═══════════════ */}
      <div
        title="Arrastrar para redimensionar"
        style={{
          width: '5px',
          cursor: 'col-resize',
          background: 'var(--border-subtle)',
          flexShrink: 0,
          transition: 'background 0.15s',
          position: 'relative',
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--accent-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = dragStateRef.current.isDragging
            ? 'var(--accent-primary)'
            : 'var(--border-subtle)';
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          dragStateRef.current = { isDragging: true, startX: e.clientX, startWidth: chatWidth };
          const onMove = (ev) => {
            if (!dragStateRef.current.isDragging) return;
            const delta = ev.clientX - dragStateRef.current.startX;
            const newWidth = Math.max(260, Math.min(680, dragStateRef.current.startWidth + delta));
            dragStateRef.current.lastWidth = newWidth;
            setChatWidth(newWidth);
          };
          const onUp = () => {
            dragStateRef.current.isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            try {
              localStorage.setItem(
                'agenthub_chat_width',
                String(dragStateRef.current.lastWidth ?? dragStateRef.current.startWidth)
              );
            } catch {
              // Persisted panel width is optional.
            }
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}
      />

      {/* ══════════════════════════════════════════════
          RIGHT PANEL — Execution view (live + traces)
          ══════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Execution panel header */}
        <div
          className="flex items-center justify-between px-4 border-b shrink-0"
          style={{
            height: '52px',
            borderColor: 'var(--border-subtle)',
            background: 'var(--surface-card)',
          }}
        >
          {/* Left: title + status badge + active model */}
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-primary)' }} />
            <span
              className="text-xs font-semibold tracking-wide shrink-0"
              style={{ color: 'var(--text-primary)' }}
            >
              Ejecución del Agente
            </span>
            {isWaitingForSubagent || isStreaming ? (
              <span
                className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  background: 'color-mix(in srgb, #34d399 15%, transparent)',
                  color: '#34d399',
                  border: '1px solid color-mix(in srgb, #34d399 30%, transparent)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Activo
              </span>
            ) : (
              <span
                className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  background: 'color-mix(in srgb, var(--text-muted) 10%, transparent)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                Inactivo
              </span>
            )}
            {(streamingModel || activeModelOverride) && (
              <span
                className="text-[10px] font-mono truncate"
                style={{ color: 'var(--text-muted)', maxWidth: '120px' }}
                title={streamingModel || activeModelOverride}
              >
                {(streamingModel || activeModelOverride)
                  .replace(/^(openai|anthropic|google)\//i, '')
                  .replace(/-\d{4}-\d{2}-\d{2}$/, '')}
              </span>
            )}
          </div>

          {/* Right: context usage + view toggle + abort (when running) + terminal link */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Context usage badge — compact inline */}
            <TokenUsageBadge usage={mergedSessionUsage} compact />
            {/* Terminal / Trazas toggle */}
            <div
              className="flex items-center rounded-md overflow-hidden"
              style={{
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-elevated, var(--surface-card))',
              }}
            >
              <button
                onClick={() => setRightPanelView('live')}
                className="flex items-center gap-1 h-6 px-2.5 text-[11px] font-medium transition-all"
                style={{
                  background: rightPanelView === 'live' ? 'var(--accent-primary)' : 'transparent',
                  color: rightPanelView === 'live' ? '#fff' : 'var(--text-muted)',
                }}
                title="Vista en vivo del agente (Markdown renderizado)"
              >
                <Monitor className="w-3 h-3" />
                Live
              </button>
              <button
                onClick={() => setRightPanelView('traces')}
                className="flex items-center gap-1 h-6 px-2.5 text-[11px] font-medium transition-all"
                style={{
                  background: rightPanelView === 'traces' ? 'var(--accent-primary)' : 'transparent',
                  color: rightPanelView === 'traces' ? '#fff' : 'var(--text-muted)',
                }}
                title="Ver trazas de herramientas"
              >
                <Activity className="w-3 h-3" />
                Trazas
              </button>
            </div>

            {(isWaitingForSubagent || isStreaming || isTyping) && (
              <button
                onClick={handleStopGenerating}
                className="flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium transition-all hover:opacity-90"
                style={{
                  background: 'color-mix(in srgb, #f87171 12%, transparent)',
                  color: '#f87171',
                  border: '1px solid color-mix(in srgb, #f87171 25%, transparent)',
                }}
                title="Detener ejecución"
              >
                <Slash className="w-3 h-3" />
                Detener
              </button>
            )}
            <button
              onClick={() => navigate(`/project/${project.id}/terminales`)}
              className="flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium transition-all hover:opacity-90"
              style={{
                background: 'var(--surface-elevated, var(--surface-card))',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
              title="Abrir terminal completa"
            >
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>

        {/* Execution content: shared IIFE resolves lastSubagentMsg, then renders Terminal log OR Trazas */}
        {(() => {
          const runningSubagentMsg = [...messages].reverse().find((m) => {
            try {
              return m.role === 'subagent' && JSON.parse(m.meta || '{}').status === 'running';
            } catch {
              return false;
            }
          });
          const lastSubagentMsg =
            runningSubagentMsg || [...messages].reverse().find((m) => m.role === 'subagent');
          let meta = {};
          try {
            meta = JSON.parse(lastSubagentMsg?.meta || '{}');
          } catch {
            // Invalid persisted metadata should not break execution view rendering.
          }
          const isRunning = meta.status === 'running';
          const traces = lastSubagentMsg ? tracesMap?.[lastSubagentMsg.id] || [] : [];
          const toolTraces = traces.filter((t) => t.type === 'tool');
          const textTraces = traces.filter((t) => t.type === 'text' || t.type === 'reasoning');

          // ── Live tab: render messages from OpenCode HTTP API with Markdown ──
          if (rightPanelView === 'live') {
            const agentLabel = meta.agentProfile || 'opencode';
            const statusColor = isRunning
              ? '#3fb950'
              : meta.status === 'error'
                ? '#f85149'
                : '#7d8590';

            // Extract parts from OC messages: show all assistant turns
            const assistantMsgs = ocMessages.filter((m) => m.info?.role === 'assistant');

            // Helpers to render individual parts
            const renderToolPart = (p, i) => {
              const isErr = p.state?.status === 'error';
              const isPending = !p.state?.status || p.state?.status === 'pending';
              const inp = p.state?.input;
              const argStr = inp
                ? String(
                    inp.path ||
                      inp.file_path ||
                      inp.pattern ||
                      inp.command ||
                      inp.query ||
                      inp.content?.slice?.(0, 80) ||
                      ''
                  ).replace(/^\/home\/[^/]+/, '~')
                : '';
              return (
                <div
                  key={p.callID || i}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'baseline',
                    fontSize: '11px',
                    lineHeight: '1.7',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  <span
                    style={{
                      color: isErr ? '#f85149' : isPending ? '#d29922' : '#3fb950',
                      width: '14px',
                      flexShrink: 0,
                    }}
                  >
                    {isPending ? '◌' : isErr ? '✗' : '✓'}
                  </span>
                  <span style={{ color: '#79c0ff', minWidth: '140px', flexShrink: 0 }}>
                    {p.tool || 'tool'}
                  </span>
                  {argStr && (
                    <span
                      style={{
                        color: '#7d8590',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '260px',
                      }}
                      title={argStr}
                    >
                      {argStr}
                    </span>
                  )}
                </div>
              );
            };

            return (
              <div
                className="flex-1 flex flex-col overflow-hidden"
                style={{ background: '#0d1117' }}
              >
                {/* Header bar */}
                <div
                  className="flex items-center gap-2 px-4 py-2 shrink-0"
                  style={{
                    borderBottom: '1px solid #21262d',
                    background: '#161b22',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  <span style={{ color: '#58a6ff', fontSize: '12px' }}>~/devhub</span>
                  <span style={{ color: '#3fb950', fontSize: '12px' }}> ❯ </span>
                  <span style={{ color: '#e6edf3', fontSize: '12px' }}>
                    opencode --agent {agentLabel}
                  </span>
                  {isRunning ? (
                    <span style={{ color: '#d29922', fontSize: '11px', marginLeft: '8px' }}>
                      <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                      running
                    </span>
                  ) : lastSubagentMsg ? (
                    <span style={{ color: statusColor, fontSize: '11px', marginLeft: '8px' }}>
                      {meta.status === 'error' ? '✗ error' : '✓ done'}
                    </span>
                  ) : null}
                </div>

                {/* Content: tool calls and Markdown text */}
                <div
                  ref={ocLiveScrollRef}
                  className="flex-1 overflow-y-auto"
                  style={{ scrollbarWidth: 'thin', padding: '16px 20px' }}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                    ocLiveIsAtBottomRef.current = distFromBottom < 80;
                  }}
                >
                  {!lastSubagentMsg || assistantMsgs.length === 0 ? (
                    <div
                      style={{
                        color: '#7d8590',
                        marginTop: '24px',
                        textAlign: 'center',
                        fontSize: '12px',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {isRunning
                        ? '…esperando respuesta del agente'
                        : 'No hay ejecución activa. Despacha un sub-agente para ver la respuesta aquí.'}
                    </div>
                  ) : (
                    assistantMsgs.map((msg, msgIdx) => {
                      const parts = msg.parts || [];
                      const toolParts = parts.filter((p) => p.type === 'tool');
                      const textPart = parts.find((p) => p.type === 'text');
                      const reasonParts = parts.filter((p) => p.type === 'reasoning');

                      return (
                        <div
                          key={msgIdx}
                          style={{ marginBottom: msgIdx < assistantMsgs.length - 1 ? '24px' : 0 }}
                        >
                          {/* Tool calls — compact log */}
                          {toolParts.length > 0 && (
                            <div
                              style={{
                                marginBottom: '12px',
                                padding: '8px 12px',
                                background: '#161b22',
                                borderRadius: '6px',
                                border: '1px solid #21262d',
                              }}
                            >
                              {toolParts.map((p, i) => renderToolPart(p, i))}
                            </div>
                          )}

                          {/* Reasoning — collapsed italic block */}
                          {reasonParts.length > 0 &&
                            reasonParts.some((p) => (p.text || '').length > 10) && (
                              <div
                                style={{
                                  marginBottom: '12px',
                                  padding: '8px 12px',
                                  background: '#161b22',
                                  borderRadius: '6px',
                                  border: '1px solid #21262d',
                                  fontStyle: 'italic',
                                  color: '#7d8590',
                                  fontSize: '11px',
                                  fontFamily: "'JetBrains Mono', monospace",
                                }}
                              >
                                {reasonParts.map((p, i) => (
                                  <div key={i}>
                                    ✦ {(p.text || '').slice(0, 200)}
                                    {(p.text || '').length > 200 ? '…' : ''}
                                  </div>
                                ))}
                              </div>
                            )}

                          {/* Text — Markdown rendered */}
                          {textPart?.text && (
                            <div
                              className="oc-markdown"
                              style={{
                                color: '#c9d1d9',
                                fontSize: '13px',
                                lineHeight: '1.7',
                              }}
                            >
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  h1: ({ children }) => (
                                    <h1
                                      style={{
                                        color: '#e6edf3',
                                        fontSize: '17px',
                                        fontWeight: 700,
                                        margin: '12px 0 6px',
                                        borderBottom: '1px solid #21262d',
                                        paddingBottom: '4px',
                                      }}
                                    >
                                      {children}
                                    </h1>
                                  ),
                                  h2: ({ children }) => (
                                    <h2
                                      style={{
                                        color: '#e6edf3',
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        margin: '10px 0 4px',
                                      }}
                                    >
                                      {children}
                                    </h2>
                                  ),
                                  h3: ({ children }) => (
                                    <h3
                                      style={{
                                        color: '#cdd0d4',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        margin: '8px 0 3px',
                                      }}
                                    >
                                      {children}
                                    </h3>
                                  ),
                                  p: ({ children }) => (
                                    <p
                                      style={{
                                        margin: '3px 0 8px',
                                        color: '#c9d1d9',
                                        lineHeight: 1.6,
                                      }}
                                    >
                                      {children}
                                    </p>
                                  ),
                                  ul: ({ children }) => (
                                    <ul
                                      style={{
                                        paddingLeft: '18px',
                                        margin: '2px 0 8px',
                                        color: '#c9d1d9',
                                      }}
                                    >
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol
                                      style={{
                                        paddingLeft: '18px',
                                        margin: '2px 0 8px',
                                        color: '#c9d1d9',
                                      }}
                                    >
                                      {children}
                                    </ol>
                                  ),
                                  li: ({ children }) => (
                                    <li
                                      style={{ margin: '1px 0', color: '#c9d1d9', lineHeight: 1.5 }}
                                    >
                                      {children}
                                    </li>
                                  ),
                                  // pre wraps block code — renders the outer box
                                  pre: ({ children }) => (
                                    <pre
                                      style={{
                                        background: '#161b22',
                                        border: '1px solid #30363d',
                                        borderRadius: '5px',
                                        padding: '10px 12px',
                                        overflowX: 'auto',
                                        margin: '6px 0',
                                        fontSize: '12px',
                                        lineHeight: 1.5,
                                      }}
                                    >
                                      {children}
                                    </pre>
                                  ),
                                  // code is called for both inline (inside p) and block (inside pre)
                                  // className presence signals a fenced/block code
                                  code: ({ className, children }) =>
                                    className ? (
                                      <code
                                        style={{
                                          color: '#c9d1d9',
                                          fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
                                          fontSize: '12px',
                                        }}
                                      >
                                        {children}
                                      </code>
                                    ) : (
                                      <code
                                        style={{
                                          background: '#21262d',
                                          color: '#79c0ff',
                                          padding: '1px 5px',
                                          borderRadius: '3px',
                                          fontFamily: "'JetBrains Mono', monospace",
                                          fontSize: '12px',
                                        }}
                                      >
                                        {children}
                                      </code>
                                    ),
                                  blockquote: ({ children }) => (
                                    <blockquote
                                      style={{
                                        borderLeft: '3px solid #3fb950',
                                        paddingLeft: '10px',
                                        margin: '6px 0',
                                        color: '#8b949e',
                                        fontStyle: 'italic',
                                      }}
                                    >
                                      {children}
                                    </blockquote>
                                  ),
                                  strong: ({ children }) => (
                                    <strong style={{ color: '#e6edf3', fontWeight: 600 }}>
                                      {children}
                                    </strong>
                                  ),
                                  a: ({ href, children }) => (
                                    <a
                                      href={href}
                                      style={{ color: '#58a6ff', textDecoration: 'underline' }}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {children}
                                    </a>
                                  ),
                                  hr: () => (
                                    <hr
                                      style={{
                                        border: 'none',
                                        borderTop: '1px solid #21262d',
                                        margin: '10px 0',
                                      }}
                                    />
                                  ),
                                }}
                              >
                                {textPart.text}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* Streaming indicator */}
                  {isRunning && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginTop: '12px',
                        color: '#7d8590',
                        fontSize: '12px',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      <Loader2 className="w-3 h-3 animate-spin" />
                      generando…
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // ── Trazas tab: categorized structured view ────────────────────────
          return (
            <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: 'thin' }}>
              {!lastSubagentMsg ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
                  <LayoutPanelLeft className="w-12 h-12" style={{ color: 'var(--text-muted)' }} />
                  <div className="text-center">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                      Sin ejecuciones activas
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Las trazas aparecerán aquí en tiempo real
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Agent identity bar */}
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{
                      background: 'var(--surface-card)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: isRunning
                          ? 'color-mix(in srgb, var(--success) 15%, transparent)'
                          : 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
                        border: isRunning
                          ? '1px solid color-mix(in srgb, var(--success) 30%, transparent)'
                          : '1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)',
                      }}
                    >
                      {isRunning ? (
                        <Loader2
                          className="w-4 h-4 animate-spin"
                          style={{ color: 'var(--success)' }}
                        />
                      ) : (
                        <Cpu className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {meta.agentProfile || 'Sub-Agente'}
                      </p>
                      <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        {isRunning ? 'ejecutando…' : meta.status || 'completed'}
                        {toolTraces.length > 0 && ` · ${toolTraces.length} herramientas`}
                      </p>
                      {meta.status === 'error' && meta.errorMessage && (
                        <p
                          className="text-[10px] font-mono mt-0.5 break-words"
                          style={{ color: 'var(--danger)', opacity: 0.85 }}
                          title={meta.errorMessage}
                        >
                          {meta.errorMessage.length > 120
                            ? meta.errorMessage.slice(0, 120) + '…'
                            : meta.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Tool calls */}
                  {toolTraces.length > 0 && (
                    <div className="space-y-1.5">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-widest px-1"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Herramientas ({toolTraces.length})
                      </p>
                      <div className="space-y-1">
                        {toolTraces.map((t, i) => {
                          const isErr = t.toolStatus === 'error';
                          const isPending =
                            !t.toolStatus ||
                            t.toolStatus === 'pending' ||
                            t.toolStatus === 'running';
                          const inp = t.toolInput;
                          const inputLabel = inp
                            ? inp.path ||
                              inp.file_path ||
                              inp.pattern ||
                              inp.command ||
                              inp.query ||
                              inp.content?.slice?.(0, 60) ||
                              null
                            : null;
                          const displayLabel = inputLabel
                            ? String(inputLabel).replace(/^\/home\/[^/]+/, '~')
                            : null;
                          return (
                            <div
                              key={t.id || i}
                              className="flex items-center gap-2.5 px-3 py-1.5 rounded-md"
                              style={{
                                background: 'var(--surface-card)',
                                border: '1px solid var(--border-subtle)',
                                opacity: isPending ? 0.75 : 1,
                              }}
                            >
                              <div className="shrink-0 w-4 h-4 flex items-center justify-center">
                                {isPending ? (
                                  <Loader2
                                    className="w-3 h-3 animate-spin"
                                    style={{ color: 'var(--accent-primary)' }}
                                  />
                                ) : isErr ? (
                                  <X className="w-3 h-3" style={{ color: 'var(--danger)' }} />
                                ) : (
                                  <CheckSquare
                                    className="w-3 h-3"
                                    style={{ color: 'var(--success)' }}
                                  />
                                )}
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span
                                  className="text-[11px] font-mono"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  {t.toolName || t.content || 'tool'}
                                </span>
                                {displayLabel && (
                                  <span
                                    className="text-[9px] font-mono truncate"
                                    style={{ color: 'var(--text-muted)' }}
                                    title={String(inputLabel)}
                                  >
                                    {displayLabel}
                                  </span>
                                )}
                              </div>
                              {t.toolStatus && (
                                <span
                                  className="text-[9px] font-mono shrink-0"
                                  style={{
                                    color: isErr
                                      ? 'var(--danger)'
                                      : isPending
                                        ? 'var(--accent-primary)'
                                        : 'var(--text-muted)',
                                  }}
                                >
                                  {t.toolStatus}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Text output */}
                  {textTraces.length > 0 &&
                    textTraces.some((t) => (t.content || '').length > 10) && (
                      <div className="space-y-1.5">
                        <p
                          className="text-[10px] font-semibold uppercase tracking-widest px-1"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Salida
                        </p>
                        <div
                          className="rounded-lg p-3 text-[11px] font-mono whitespace-pre-wrap break-words max-h-[360px] overflow-y-auto"
                          style={{
                            background: 'var(--surface-card)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.6,
                          }}
                        >
                          {textTraces
                            .map((t) => t.content || '')
                            .join('\n\n')
                            .slice(0, 4000)}
                          {textTraces.map((t) => t.content || '').join('').length > 4000 && (
                            <span style={{ color: 'var(--text-muted)' }}>{'\n…(truncado)'}</span>
                          )}
                        </div>
                      </div>
                    )}

                  {/* Empty */}
                  {toolTraces.length === 0 && textTraces.length === 0 && (
                    <div
                      className="flex flex-col items-center justify-center py-10 gap-2 rounded-lg"
                      style={{
                        background: 'var(--surface-card)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <Loader2
                        className="w-5 h-5 animate-spin"
                        style={{ color: 'var(--accent-primary)', opacity: 0.5 }}
                      />
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {isRunning ? 'Esperando trazas…' : 'Sin trazas disponibles'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* AgentStatusBar pinned at bottom of execution panel */}
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
          let agentModel = streamingModel || activeModelOverride || '';
          let toolCallCount = 0;

          if (runningSubagent) {
            let meta = {};
            try {
              meta = JSON.parse(runningSubagent.meta || '{}');
            } catch {
              // Invalid subagent metadata should not break status bar rendering.
            }
            agentName = meta.agentProfile
              ? meta.agentProfile
                  .replace(/^openai\/|^anthropic\/|^google\//i, '')
                  .replace(/-\d{4}-\d{2}-\d{2}$/, '')
              : 'Sub-Agente';
            if (meta.model) agentModel = meta.model;
            const trace = tracesMap?.[runningSubagent.id] || [];
            toolCallCount = trace.filter((p) => p.type === 'tool').length;
          }

          return (
            <AgentStatusBar
              isActive={isActive}
              agentName={agentName}
              model={agentModel}
              tokenCount={mergedSessionUsage?.total_tokens || 0}
              tokenLimit={mergedSessionUsage?.context_window_size || 200000}
              toolCallCount={toolCallCount}
              onInterrupt={handleStopGenerating}
              onCommandPalette={() => setShowCommandPalette(true)}
            />
          );
        })()}
      </div>

      {/* ══════════════════════════════════════════════
          MODALS (full-screen overlays, outside split)
          ══════════════════════════════════════════════ */}

      {/* Session List Modal */}
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

      {/* Permission Modal */}
      <PermissionModal
        isOpen={!!permissionRequest}
        onClose={() => setPermissionRequest(null)}
        onApprove={handlePermissionApprove}
        onReject={handlePermissionReject}
        permission={permissionRequest}
      />

      {/* Output Viewer Modal */}
      <OutputViewerModal
        isOpen={outputViewer.isOpen}
        onClose={() => setOutputViewer({ isOpen: false, title: '', content: '', language: '' })}
        title={outputViewer.title}
        content={outputViewer.content}
        language={outputViewer.language}
      />

      {/* MCP Status Panel (slide-in drawer) */}
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
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Cerrar panel MCP"
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
    </div>
  );
}
