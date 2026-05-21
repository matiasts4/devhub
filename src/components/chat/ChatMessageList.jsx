import {
  Brain,
  User,
  TerminalSquare,
  Loader2,
  Copy,
  Pencil,
  RefreshCw,
  Sparkles,
  Square,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ChatMarkdown from '@/components/chat/ChatMarkdown';
import StreamingMessage from '@/components/chat/StreamingMessage';
import AgentTracePanel from '@/components/chat/AgentTracePanel';
import MCPAccordion from '@/components/chat/MCPAccordion';
import SubagentBadge from '@/components/chat/SubagentBadge';
import { Button } from '@/components/ui/button';
import { normalizeSubagentStatus } from '@/lib/agenthubSubagentState';

// ─── User Turn ────────────────────────────────────────────────────────────────
// Estilo OpenCode: prompt compacto con línea izquierda, sin burbuja
function UserTurn({
  message,
  isEditing,
  editDraft,
  isTyping,
  isStreaming,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onCopyMessage,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
    onCopyMessage?.(message);
  };

  return (
    <div className="group/turn relative flex gap-3 py-4 px-0 pl-4">
      {/* Línea vertical izquierda — color accent sutil */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full opacity-0 group-hover/turn:opacity-40 transition-opacity"
        style={{ background: 'var(--accent-primary)' }}
      />

      {/* Avatar compacto */}
      <div
        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border mt-0.5"
        style={{
          background: 'var(--surface-hover)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <User className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
      </div>

      <div className="flex-1 min-w-0">
        {/* Label */}
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            Vos
          </span>

          {/* Acciones — visibles en hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover/turn:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Copiar"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
            {!isTyping && !isStreaming && (
              <button
                type="button"
                onClick={() => onStartEdit?.(message.id, message.content)}
                className="p-1 rounded transition-colors"
                style={{ color: 'var(--text-muted)' }}
                title="Editar"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Contenido — edición o texto con fondo diferenciado */}
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editDraft}
              onChange={(e) => onEditChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onSaveEdit?.(message.id);
                }
                if (e.key === 'Escape') onCancelEdit?.();
              }}
              className="w-full rounded-lg p-3 text-sm font-sans resize-none focus:outline-none"
              style={{
                background: 'var(--surface-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-strong)',
              }}
              rows={Math.min((editDraft || '').split('\n').length + 1, 10)}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => onSaveEdit?.(message.id)}
                style={{ background: 'var(--accent-primary)', color: '#fff' }}
              >
                Guardar y regenerar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onCancelEdit?.()}
                style={{ color: 'var(--text-muted)' }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="text-sm leading-relaxed whitespace-pre-wrap rounded-lg px-3 py-2.5"
            style={{
              color: 'var(--text-primary)',
              background: 'color-mix(in srgb, var(--surface-hover) 60%, transparent)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Assistant Turn ───────────────────────────────────────────────────────────
// Estilo OpenCode: respuesta full-width sin burbuja, con label "Assistant"
function AssistantTurn({
  message,
  renderedContent,
  isTyping,
  isStreaming,
  onCopyMessage,
  onRegenerate,
  subagents = [],
  onViewSubagent,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
    onCopyMessage?.(message);
  };

  return (
    <div className="group/turn relative flex gap-3 py-3 px-0">
      {/* Línea vertical izquierda — accent visible */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full"
        style={{ background: 'color-mix(in srgb, var(--accent-primary) 25%, transparent)' }}
      />

      {/* Avatar */}
      <div
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border mt-0.5"
        style={{
          background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
          boxShadow: '0 0 8px color-mix(in srgb, var(--accent-primary) 15%, transparent)',
        }}
      >
        <Brain className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
      </div>

      <div className="flex-1 min-w-0">
        {/* Label + acciones */}
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--accent-primary)', opacity: 0.7 }}
          >
            Orquestador
          </span>

          <div className="flex items-center gap-1 opacity-0 group-hover/turn:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Copiar"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
            {!isTyping && !isStreaming && (
              <button
                type="button"
                onClick={() => onRegenerate?.(message.id)}
                className="p-1 rounded transition-colors"
                style={{ color: 'var(--text-muted)' }}
                title="Regenerar"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Contenido markdown */}
        <div className="chat-markdown">
          <ChatMarkdown>{renderedContent}</ChatMarkdown>
        </div>

        {/* Subagent badge — aparece cuando el orquestador lanzó subagentes */}
        {subagents.length > 0 && (
          <SubagentBadge subagents={subagents} onViewSubagent={onViewSubagent} />
        )}
      </div>
    </div>
  );
}

// ─── Subagent Execution Turn ──────────────────────────────────────────────────
// Estilo OpenCode: colapsado por defecto, 1 línea de summary expandible.
// Running: auto-expandido, muestra última tarea activa.
// Completado/Error: colapsado — click para ver el trace.
// compact=true: nunca auto-expande (usado cuando el panel Live muestra el detalle).
function SubagentTurn({ message, trace, onCancel, onViewInContext, compact = false }) {
  let meta = {};
  try {
    meta = message.meta ? JSON.parse(message.meta) : {};
  } catch {}

  const status = normalizeSubagentStatus(meta.status || 'success');
  const isRunning = status === 'running';
  const isSuccess = status === 'success';
  const isError = status === 'error' || status === 'aborted';

  // Running: auto-expandido (salvo en modo compact donde el panel Live ya muestra el detalle)
  const [expanded, setExpanded] = useState(isRunning && !compact);
  useEffect(() => {
    if (isRunning && !compact) setExpanded(true);
  }, [isRunning, compact]);

  const toolCount = trace.filter((p) => p.type === 'tool').length;
  const doneTools = trace.filter((p) => p.type === 'tool' && p.toolStatus === 'completed').length;

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  useEffect(() => {
    if (!isRunning) {
      clearInterval(timerRef.current);
      const start = meta.startedAt || message.created_at;
      if (start) {
        setElapsed(Math.floor((Date.now() - new Date(start).getTime()) / 1000));
      }
      return;
    }
    const startMs = meta.startedAt
      ? new Date(meta.startedAt).getTime()
      : message.created_at
        ? new Date(message.created_at).getTime()
        : Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isRunning]); // eslint-disable-line

  const formatElapsed = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

  // Nombre limpio
  const rawProfile = meta.agentProfile || meta.model || meta.agent || '';
  const agentLabel = rawProfile
    ? rawProfile
        .replace(/^openai\/|^anthropic\/|^google\//, '')
        .replace(/-\d{4}-\d{2}-\d{2}$/, '')
        .replace(/-latest$/, '')
    : 'Sub-agente';

  // Última línea activa del trace
  const lastTextPart = [...trace].reverse().find((p) => p.type === 'text' && p.content?.trim());
  const activeTask = lastTextPart?.content?.trim().slice(0, 90) || '';

  // Colores
  const statusColor = isRunning ? '#f59e0b' : isSuccess ? '#34d399' : '#f87171';
  const lineColor = isRunning
    ? 'rgba(245,158,11,0.5)'
    : isSuccess
      ? 'rgba(52,211,153,0.35)'
      : 'rgba(248,113,113,0.35)';

  return (
    <div className="relative flex flex-col py-2 px-0">
      {/* Línea izquierda */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-full transition-colors duration-500 ${isRunning ? 'animate-pulse' : ''}`}
        style={{ background: lineColor }}
      />

      <div className="flex gap-3">
        {/* Avatar compacto */}
        <div
          className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border mt-0.5"
          style={{
            background: isRunning
              ? 'rgba(245,158,11,0.12)'
              : isSuccess
                ? 'rgba(52,211,153,0.08)'
                : 'rgba(248,113,113,0.08)',
            borderColor: isRunning
              ? 'rgba(245,158,11,0.35)'
              : isSuccess
                ? 'rgba(52,211,153,0.25)'
                : 'rgba(248,113,113,0.25)',
          }}
        >
          <TerminalSquare className="w-3 h-3" style={{ color: statusColor }} />
        </div>

        <div className="flex-1 min-w-0">
          {/* ── Summary row — siempre visible ── */}
          <div className="flex items-center gap-2">
            {/* Expand button — toda la fila cuando no está corriendo */}
            <button
              onClick={() => !isRunning && setExpanded((v) => !v)}
              className={`flex items-center gap-2 flex-1 min-w-0 text-left ${!isRunning ? 'cursor-pointer group/subagent' : 'cursor-default'}`}
            >
              {/* Status icon */}
              {isRunning ? (
                <Loader2
                  className="w-3 h-3 animate-spin flex-shrink-0"
                  style={{ color: statusColor }}
                />
              ) : isSuccess ? (
                <span
                  className="flex-shrink-0 text-[12px] font-bold"
                  style={{ color: statusColor }}
                >
                  ✓
                </span>
              ) : (
                <span
                  className="flex-shrink-0 text-[12px] font-bold"
                  style={{ color: statusColor }}
                >
                  ✗
                </span>
              )}

              {/* Agent name */}
              <span
                className="text-[12px] font-mono flex-shrink-0"
                style={{ color: 'var(--text-secondary)' }}
              >
                {agentLabel}
              </span>

              {/* Active task — visible mientras corre */}
              {isRunning && activeTask ? (
                <>
                  <span className="text-[11px]" style={{ color: 'var(--border-strong)' }}>
                    –
                  </span>
                  <span
                    className="text-[11px] font-mono truncate flex-1 italic"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {activeTask}
                  </span>
                </>
              ) : !isRunning ? (
                <span
                  className="text-[11px] font-mono flex-shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {[
                    toolCount > 0 ? `${toolCount} toolcalls` : null,
                    elapsed > 0 ? formatElapsed(elapsed) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              ) : null}

              {/* Running: tool progress */}
              {isRunning && toolCount > 0 && (
                <span
                  className="text-[10px] font-mono flex-shrink-0 ml-auto"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {doneTools}/{toolCount} tools
                </span>
              )}

              {/* Chevron cuando está completado */}
              {!isRunning && (
                <span
                  className="ml-auto flex-shrink-0 text-[9px] opacity-40 group-hover/subagent:opacity-70 transition-opacity"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {expanded ? '▼' : '▶'}
                </span>
              )}
            </button>

            {/* Acciones — fuera del expand button */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {onViewInContext && (
                <button
                  onClick={onViewInContext}
                  className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)]"
                  style={{ color: 'var(--accent-primary)' }}
                  title="Ver subagente"
                >
                  <TerminalSquare className="w-2.5 h-2.5" />
                  ver
                </button>
              )}
              {isRunning && onCancel && (
                <button
                  onClick={onCancel}
                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors hover:bg-red-500/20"
                  style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
                >
                  <Square className="w-2 h-2" />
                  detener
                </button>
              )}
            </div>
          </div>

          {/* ── Trace expandible ── */}
          <div
            className={`grid transition-all duration-300 ${expanded ? 'grid-rows-[1fr] mt-2' : 'grid-rows-[0fr]'}`}
          >
            <div className="overflow-hidden">
              <div
                className="rounded-md overflow-hidden"
                style={{
                  border: '1px solid var(--border-subtle)',
                  background: 'color-mix(in srgb, var(--surface-elevated) 60%, transparent)',
                }}
              >
                <AgentTracePanel
                  trace={trace}
                  isRunning={isRunning}
                  searchTerm=""
                  filterType="all"
                  filterStatus="all"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Separador entre turnos ───────────────────────────────────────────────────
function TurnDivider() {
  return (
    <div className="border-t my-1" style={{ borderColor: 'var(--border-subtle)', opacity: 0.4 }} />
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onSetPrompt }) {
  const suggestions = [
    'Analiza un stack trace y propone un fix',
    'Diseña y escribe tests unitarios para este módulo',
    'Explora el codebase y detecta code smells',
    'Refactoriza este componente aplicando Clean Architecture',
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full py-16 opacity-90">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center border mb-6 relative"
        style={{
          background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
        }}
      >
        <Brain className="w-6 h-6" style={{ color: 'var(--accent-primary)' }} />
        <Sparkles
          className="w-3 h-3 absolute -top-1.5 -right-1.5"
          style={{ color: 'var(--accent-secondary, var(--accent-primary))' }}
        />
      </div>

      <h2
        className="text-base font-mono mb-1.5 font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Gentleman — Agent Orchestrator
      </h2>
      <p
        className="text-xs max-w-sm text-center mb-8 leading-relaxed"
        style={{ color: 'var(--text-muted)' }}
      >
        Describí el problema técnico. Orquestaré sub-agentes OpenCode para explorar, diseñar y
        ejecutar.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full px-4">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSetPrompt?.(s)}
            className="flex items-start gap-2 px-3 py-2.5 text-left text-[11px] font-mono rounded-lg border transition-all hover:border-[color:var(--accent-primary)] hover:bg-[color:var(--surface-card)]"
            style={{
              background: 'var(--surface-app)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-secondary)',
            }}
          >
            <ChevronRight
              className="w-3 h-3 mt-0.5 flex-shrink-0"
              style={{ color: 'var(--accent-primary)' }}
            />
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MCP Tool Response ────────────────────────────────────────────────────────
// Compacto: solo el pill del MCPAccordion, sin avatar/header propio
function McpTurn({ message, detectMcpOutput }) {
  const mcpDetected = detectMcpOutput?.(message.content) || { type: 'info', defaultOpen: false };
  return (
    <div className="py-1 px-0 pl-1">
      <MCPAccordion content={message.content} defaultOpen={mcpDetected.defaultOpen} />
    </div>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex gap-3 py-3">
      <div
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border"
        style={{
          background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
        }}
      >
        <div className="flex gap-0.5">
          {[0, 0.15, 0.3].map((delay) => (
            <div
              key={delay}
              className="w-1 h-1 rounded-full animate-bounce"
              style={{ background: 'var(--accent-primary)', animationDelay: `${delay}s` }}
            />
          ))}
        </div>
      </div>
      <div className="flex-1 flex items-center">
        <span
          className="text-[11px] font-mono animate-pulse"
          style={{ color: 'var(--text-muted)' }}
        >
          Pensando...
        </span>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function ChatMessageList({
  messages,
  tracesMap,
  isTyping,
  isWaitingForSubagent,
  isStreaming,
  streamingContentRef,
  streamingModel,
  messagesEndRef,
  editingMessageId,
  editDraft,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onRegenerate,
  onCopyMessage,
  onStartEdit,
  onCancelSubagent,
  onSetPrompt,
  formatMessage,
  detectMcpOutput,
  onViewSubagent,
  onViewSubagentInContext,
  compactSubagentTurns = false,
}) {
  // ── Scroll container ref + smart auto-scroll ─────────────────────────────
  const scrollContainerRef = useRef(null);
  const isAtBottomRef = useRef(true);

  // Detectar si el usuario se alejó del fondo
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 120;
  }, []);

  // Scrollear al fondo cuando llega contenido nuevo (solo si estaba abajo)
  useEffect(() => {
    if (!isAtBottomRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isTyping, isStreaming, isWaitingForSubagent]);

  // Mantener scroll al bottom mientras llegan partes de trace (60fps mínimo)
  const tracePartCount = Object.values(tracesMap || {}).reduce((acc, arr) => acc + arr.length, 0);
  useEffect(() => {
    if (!isWaitingForSubagent && !isStreaming) return;
    if (!isAtBottomRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [tracePartCount, isWaitingForSubagent, isStreaming]);

  // ── Track subagents per assistant message ─────────────────────────────
  // Build a map: assistantMsgId → array of subagent messages that followed it
  const subagentsByAssistant = useMemo(() => {
    const map = {};
    let lastAssistantId = null;
    for (const m of messages) {
      if (m.role === 'assistant') {
        lastAssistantId = m.id;
        if (!map[lastAssistantId]) map[lastAssistantId] = [];
      } else if (m.role === 'subagent' && lastAssistantId) {
        if (!map[lastAssistantId]) map[lastAssistantId] = [];
        const trace = tracesMap?.[m.id] || [];
        const toolCount = trace.filter((p) => p.type === 'tool').length;
        const doneTools = trace.filter(
          (p) => p.type === 'tool' && p.toolStatus === 'completed'
        ).length;
        let meta = {};
        try {
          meta = JSON.parse(m.meta || '{}');
        } catch {}
        map[lastAssistantId].push({
          id: m.id,
          agentProfile: meta.agentProfile || 'Sub-Agent',
          status: normalizeSubagentStatus(meta.status || 'success'),
          sessionId: meta.sessionId,
          toolCount,
          doneTools,
        });
      }
    }
    return map;
  }, [messages, tracesMap]);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
      style={{ background: 'var(--surface-app)' }}
    >
      <div className="max-w-[860px] mx-auto px-8 py-5 pb-10">
        {messages.length === 0 && !isTyping && !isStreaming ? (
          <EmptyState onSetPrompt={onSetPrompt} />
        ) : (
          <>
            {messages.map((m, idx) => {
              // MCP responses (system messages hidden as tool calls)
              const isMcpResponse =
                m.role === 'user' &&
                (m.content?.startsWith('[Respuesta del Sistema Engram]:') ||
                  m.content?.startsWith('[Error del Sistema Engram]:'));

              if (isMcpResponse) {
                return (
                  <div key={m.id}>
                    <McpTurn message={m} detectMcpOutput={detectMcpOutput} />
                    <TurnDivider />
                  </div>
                );
              }

              // Subagent execution — trace inline
              if (m.role === 'subagent') {
                return (
                  <div key={m.id}>
                    <SubagentTurn
                      message={m}
                      trace={tracesMap?.[m.id] || []}
                      compact={compactSubagentTurns}
                      onCancel={(() => {
                        try {
                          return JSON.parse(m.meta || '{}').status === 'running'
                            ? onCancelSubagent
                            : null;
                        } catch {
                          return null;
                        }
                      })()}
                      onViewInContext={
                        onViewSubagentInContext ? () => onViewSubagentInContext(m) : null
                      }
                    />
                    <TurnDivider />
                  </div>
                );
              }

              // User turn
              if (m.role === 'user') {
                return (
                  <div key={m.id}>
                    <UserTurn
                      message={m}
                      isEditing={editingMessageId === m.id}
                      editDraft={editDraft}
                      isTyping={isTyping}
                      isStreaming={isStreaming}
                      onEditChange={onEditChange}
                      onSaveEdit={onSaveEdit}
                      onCancelEdit={onCancelEdit}
                      onStartEdit={onStartEdit}
                      onCopyMessage={onCopyMessage}
                    />
                    <TurnDivider />
                  </div>
                );
              }

              // Assistant turn
              if (m.role === 'assistant') {
                const renderedContent = formatMessage?.(m.content) || m.content;
                const subagents = subagentsByAssistant[m.id] || [];
                return (
                  <div key={m.id}>
                    <AssistantTurn
                      message={m}
                      renderedContent={renderedContent}
                      isTyping={isTyping}
                      isStreaming={isStreaming}
                      onCopyMessage={onCopyMessage}
                      onRegenerate={onRegenerate}
                      subagents={subagents}
                      onViewSubagent={onViewSubagent}
                    />
                    <TurnDivider />
                  </div>
                );
              }

              return null;
            })}

            {/* Streaming del orquestador — inline, sin burbuja */}
            {isStreaming && (
              <div>
                <div className="relative flex gap-3 py-3 px-0">
                  <div
                    className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full animate-pulse"
                    style={{
                      background: 'color-mix(in srgb, var(--accent-primary) 40%, transparent)',
                    }}
                  />
                  <div
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border mt-0.5"
                    style={{
                      background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                    }}
                  >
                    <div className="flex gap-0.5">
                      {[0, 0.15, 0.3].map((delay) => (
                        <div
                          key={delay}
                          className="w-1 h-1 rounded-full animate-bounce"
                          style={{
                            background: 'var(--accent-primary)',
                            animationDelay: `${delay}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                      style={{ color: 'var(--accent-primary)', opacity: 0.7 }}
                    >
                      Orquestador{streamingModel ? ` · ${streamingModel}` : ''}
                    </div>
                    <StreamingMessage contentRef={streamingContentRef} model={null} />
                  </div>
                </div>
                <TurnDivider />
              </div>
            )}

            {/* Typing indicator — solo cuando no hay streaming ni subagente */}
            {isTyping && !isWaitingForSubagent && !isStreaming && (
              <div>
                <TypingIndicator />
                <TurnDivider />
              </div>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
