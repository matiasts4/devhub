'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { dispatchZedOpenTerminal } from '@/components/zedOpenTerminalEvent';
import { dispatchZedOpenUrlFromToolResults } from '@/components/zedOpenUrlEvent';
import { buildZedHistory } from './buildZedHistory';
import {
  MAX_ZED_TERMINAL_PANELS,
  isWorkspaceTerminalPanelLimitReached,
} from '@/lib/terminal/workspaceTerminalLimits';

export const DEFAULT_ZED_GREETING = {
  role: 'assistant',
  content: 'Hola, soy Zed. ¿En qué te puedo ayudar?',
  timestamp: 'initial',
};

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function readPersistedZedMessages(sessionKey) {
  if (typeof window === 'undefined' || !sessionKey) return null;
  try {
    const raw = window.sessionStorage.getItem(sessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Shared Zed chat state for ZedAmbientOverlay.
 *
 * @param {object} [options]
 * @param {string} [options.sessionKey]
 */
export function useZedChat({
  sessionKey = 'devhub-zed-chat-default',
  getTerminalPanelCount = null,
} = {}) {
  const [messages, setMessages] = useState(() => [DEFAULT_ZED_GREETING]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const textareaRef = useRef(null);
  const dispatchedSessionIdsRef = useRef(new Set());

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && typeof m.content === 'string');

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    const ctrl = new AbortController();
    setAbortController(ctrl);

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
    ]);

    try {
      const history = buildZedHistory(messages);
      const terminalPanelCount =
        typeof getTerminalPanelCount === 'function' ? Number(getTerminalPanelCount()) || 0 : 0;
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history,
          context: {
            terminal_panel_count: terminalPanelCount,
            max_terminal_panels: MAX_ZED_TERMINAL_PANELS,
          },
        }),
        signal: ctrl.signal,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const upstream = data?.upstream_status ? ` (upstream ${data.upstream_status})` : '';
        const errText =
          (typeof data?.error === 'string' && data.error) ||
          `Error del asistente: HTTP ${response.status}${upstream}`;
        throw new Error(errText);
      }

      const toolResults = data.tool_results;

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.text || 'No pude procesar tu mensaje.',
          timestamp: new Date().toISOString(),
          tool_results: toolResults,
        },
      ]);
      dispatchZedOpenUrlFromToolResults(toolResults);
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
    }
  }, [getTerminalPanelCount, input, isLoading, messages]);

  const handleStop = useCallback(() => {
    abortController?.abort();
    setIsLoading(false);
  }, [abortController]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handlePaste = useCallback((e) => {
    const text =
      e.clipboardData && typeof e.clipboardData.getData === 'function'
        ? e.clipboardData.getData('text/plain')
        : '';
    if (text) {
      e.preventDefault();
      setInput((prev) => (prev || '') + text);
    }
  }, []);

  useEffect(() => {
    const persisted = readPersistedZedMessages(sessionKey);
    if (persisted) {
      setMessages(persisted);
      return;
    }
    setMessages((prev) => {
      if (prev.length === 0 || prev[0].timestamp !== 'initial') return prev;
      const updated = [...prev];
      updated[0] = { ...updated[0], timestamp: new Date().toISOString() };
      return updated;
    });
  }, [sessionKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !sessionKey) return;
    try {
      window.sessionStorage.setItem(sessionKey, JSON.stringify(messages));
    } catch {
      // Ignore quota / private mode failures.
    }
  }, [messages, sessionKey]);

  useEffect(() => {
    let lastMessage = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].tool_results?.some((r) => r.tool === 'open_terminal')) {
        lastMessage = messages[i];
        break;
      }
    }
    if (!lastMessage) return;
    const openTerminalResult = lastMessage.tool_results.find((r) => {
      if (r.tool !== 'open_terminal') return false;
      const raw = r.result;
      const parsed = typeof raw === 'string' ? safeParse(raw) : raw;
      return parsed && !parsed.error;
    });
    const result = openTerminalResult?.result;
    if (!result) return;
    const parsedResult = typeof result === 'string' ? safeParse(result) : result;
    if (!parsedResult || parsedResult.error) return;

    const currentPanelCount =
      typeof getTerminalPanelCount === 'function' ? Number(getTerminalPanelCount()) || 0 : 0;
    if (isWorkspaceTerminalPanelLimitReached(currentPanelCount, MAX_ZED_TERMINAL_PANELS)) return;
    const parsed = parsedResult;
    const isWorkspaceOpen = parsed?.workspace === true || parsed?.opened === true;
    if (!isWorkspaceOpen && !parsed?.session_id) return;

    const commandToRun =
      (typeof parsed?.command_sent === 'string' && parsed.command_sent) ||
      (typeof parsed?.command === 'string' && parsed.command) ||
      null;
    const dispatchKey = isWorkspaceOpen
      ? `ws:${commandToRun || ''}:${parsed?.cwd || ''}`
      : parsed.session_id;

    if (dispatchedSessionIdsRef.current.has(dispatchKey)) return;
    dispatchedSessionIdsRef.current.add(dispatchKey);

    dispatchZedOpenTerminal({
      command: commandToRun,
      cwd: parsed?.cwd || null,
      workspace: isWorkspaceOpen,
      session_id: isWorkspaceOpen ? null : parsed.session_id,
      focus: parsed.focus !== false,
    });
  }, [getTerminalPanelCount, messages]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    handleSend,
    handleStop,
    handleKeyDown,
    handlePaste,
    textareaRef,
    lastAssistantMessage,
  };
}