'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Loader2, Square } from 'lucide-react';
import ToolResult from './ToolResult';
import { dispatchZedOpenTerminal } from '@/components/zedOpenTerminalEvent';

function ChatMessage({ role, content, timestamp }) {
  const isZed = role === 'zed' || role === 'assistant';
  return (
    <div className={`flex ${isZed ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] ${
          isZed
            ? 'bg-[var(--surface-muted)] border border-[var(--border-subtle)]'
            : 'bg-[var(--accent-primary)] text-white'
        }`}
        style={isZed ? { color: 'var(--text-primary)' } : {}}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        <p className={`text-[10px] mt-1 ${isZed ? 'text-[var(--text-muted)]' : 'text-white/60'}`}>
          {timestamp
            ? new Date(timestamp).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </p>
      </div>
    </div>
  );
}

export default function ChatPanel({ className = '' }) {
  // D9 + T-010b: hydration-safe sentinel. Server and client must produce the
  // SAME first-render output, so we cannot call `new Date()` in the lazy
  // initializer (server time ≠ client time → React 18 hydration mismatch).
  // The initializer returns the literal sentinel `'initial'`, and a useEffect
  // below replaces it with a real ISO string AFTER mount.
  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      content: 'Hola, soy Zed. ¿En qué te puedo ayudar?',
      timestamp: 'initial',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // D8: per-request AbortController. Stored in state so handleStop can
    // reach it. Cleared in finally to avoid holding a stale ref.
    const ctrl = new AbortController();
    setAbortController(ctrl);

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
    ]);

    try {
      // T-033: send the conversation history (last 20 messages, flattened
      // into the server protocol by `buildZedHistory`). The server prepends
      // it to the per-turn tool loop so the model retains recent context
      // across requests.
      const history = buildZedHistory(
        // Exclude the message we just optimistically appended in
        // setMessages above (line 68-71) — that one is sent as `message`.
        messages.slice(0, -1)
      );
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history, context: {} }),
        signal: ctrl.signal,
      });

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.text || 'No pude procesar tu mensaje.',
          timestamp: new Date().toISOString(),
          tool_results: data.tool_results,
        },
      ]);
    } catch (error) {
      const aborted = error?.name === 'AbortError';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: aborted ? '(Solicitud cancelada)' : `Error: ${error.message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
      setAbortController(null);
      setTimeout(scrollToBottom, 100);
    }
  }, [input, isLoading, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // T-018: paste handler. We read the clipboard text and append it to the
  // input state ourselves, then call preventDefault to stop the default
  // paste (which would otherwise insert at the cursor position only and
  // bypass our controlled input). This also guards against any future
  // global handler that might cancel the default — by owning the paste
  // we are robust to capture-phase document listeners that the textarea
  // itself cannot intercept.
  const handlePaste = useCallback((e) => {
    const text =
      e.clipboardData && typeof e.clipboardData.getData === 'function'
        ? e.clipboardData.getData('text/plain')
        : '';
    if (text) {
      e.preventDefault();
      setInput((prev) => (prev || '') + text);
      setTimeout(updateTextareaHeight, 0);
    }
  }, []);

  const handleStop = useCallback(() => {
    abortController?.abort();
    setIsLoading(false);
  }, [abortController]);

  // T-010b: replace the hydration sentinel with a real timestamp post-mount.
  // Server and first client render share the same `'initial'` string; only
  // after the client commits does the real time appear in the UI.
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 0 || prev[0].timestamp !== 'initial') return prev;
      const updated = [...prev];
      updated[0] = { ...updated[0], timestamp: new Date().toISOString() };
      return updated;
    });
  }, []);

  // D9: dispatch `devhub:zed-open-terminal` when an open_terminal tool result
  // arrives. Replaces the side-effect that used to live inside the old
  // inline ToolBadge component.
  // T-WSR-zed-001 (ASST-UI-001): the dispatch site MUST NOT fire the
  // event for the same session_id twice. Every subsequent `messages`
  // change re-runs this effect, and the same assistant turn (the one
  // that contains the open_terminal result) would otherwise be
  // re-found. The ref Set is the simplest single-source-of-truth guard;
  // it survives React strict-mode double-invocation (both invocations
  // hit the same ref; the second sees the session_id and bails).
  const dispatchedSessionIdsRef = useRef(new Set());

  useEffect(() => {
    let lastMessage = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].tool_results?.some((r) => r.tool === 'open_terminal')) {
        lastMessage = messages[i];
        break;
      }
    }
    if (!lastMessage) return;
    const openTerminalResult = lastMessage.tool_results.find((r) => r.tool === 'open_terminal');
    const result = openTerminalResult?.result;
    if (!result || result.error) return;
    const parsed = typeof result === 'string' ? safeParse(result) : result;
    if (!parsed?.session_id) return;

    // Re-fire guard: bail if this session_id was already dispatched.
    if (dispatchedSessionIdsRef.current.has(parsed.session_id)) return;
    dispatchedSessionIdsRef.current.add(parsed.session_id);

    // Dispatch via the helper (ZEB-005: this is the ONLY allowed site
    // for a `devhub:zed-open-terminal` dispatch).
    dispatchZedOpenTerminal({
      command: parsed?.command || null,
      cwd: parsed?.cwd || null,
      session_id: parsed.session_id,
      focus: parsed.focus === true,
    });
  }, [messages]);

  // Auto-resize textarea
  const updateTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, []);

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)] flex items-center justify-center">
            <span className="text-white font-bold text-sm">Z</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Zed
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Asistente
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i}>
            <ChatMessage role={msg.role} content={msg.content} timestamp={msg.timestamp} />
            {msg.tool_results?.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {msg.tool_results.map((r, j) => (
                  <ToolResult key={j} toolName={r.tool} result={r.result} />
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Zed está escribiendo...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-[var(--border-subtle)]">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setTimeout(updateTextareaHeight, 0);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Escribile a Zed..."
            rows={1}
            className="flex-1 bg-[var(--surface-muted)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent-primary)] resize-none"
            style={{ color: 'var(--text-primary)', maxHeight: '120px' }}
          />
          {isLoading ? (
            <button
              onClick={handleStop}
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--danger,#ef4444)] text-white"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--accent-primary)] text-white disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * T-033: flatten the client's `messages` state (an array of
 * { role, content, timestamp, tool_results? } entries used for rendering)
 * into the conversation protocol the assistant route expects:
 *   - user messages become { role: 'user', content }
 *   - assistant messages become { role: 'assistant', content }
 *   - each tool_result inside an assistant message becomes its own
 *     { role: 'user', content: `Tool <name> result: <json>` } entry,
 *     matching how the server injects results into the loop (route.js:260-263).
 *
 * @param {Array} messages - the ChatPanel messages state
 * @param {number} maxLen - cap on entries returned (default 20)
 * @returns {Array} history array suitable for `POST /api/assistant/chat` body
 */
export function buildZedHistory(messages, maxLen = 20) {
  if (!Array.isArray(messages)) return [];
  const flat = [];
  for (const m of messages.slice(-maxLen)) {
    if (!m || typeof m !== 'object') continue;
    if (m.role === 'user' && typeof m.content === 'string') {
      flat.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant' && typeof m.content === 'string') {
      flat.push({ role: 'assistant', content: m.content });
      if (Array.isArray(m.tool_results)) {
        for (const r of m.tool_results) {
          if (!r || !r.tool) continue;
          flat.push({
            role: 'user',
            content: `Tool ${r.tool} result: ${JSON.stringify(r.result ?? null)}`,
          });
        }
      }
    }
  }
  return flat;
}
