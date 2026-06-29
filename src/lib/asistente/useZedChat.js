'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { buildZedHistory } from './buildZedHistory';
import { extractToolType } from './buildZedAmbientStatus';
import { MAX_ZED_TERMINAL_PANELS } from '@/lib/terminal/workspaceTerminalLimits';
import { dispatchZedAuraToolType, dispatchZedAuraOutcome } from './zedOverlayEvents';
import { formatToolErrorForUser, _WELCOME_LINE as WELCOME_LINE } from './zedChat/errors';
import { dispatchAllZedToolResults } from './dispatchZedActions';
import { consumeZedSseStream } from './zedStreamProtocol';
import { zedClientDebug } from './zedClientDebug';
import { labelForZedToolStart } from './zedToolLabels';
import { recordZedInteraction, readZedAuditTrail } from './zedAuditTrail';
import { readVoiceSettings } from '@/lib/voice/voiceFeatureFlag';
import { recordChatRoundTrip, getMetricsSummary } from './zedMetrics';
import { useZedPlanRunner, PLAN_STATES as PLAN_EXECUTOR_STATES } from './useZedPlanRunner';
import { detectMaliciousPrompt } from './zedSecurityPolicy';
import {
  getZedMemory,
  setZedPreference,
  getZedPreference,
  recordZedMemoryAction,
  setZedAgentStatus,
  getZedAgentStatus,
  addZedPendingPlan,
  removeZedPendingPlan,
} from './zedMemory';

export const DEFAULT_ZED_GREETING = {
  role: 'assistant',
  content: WELCOME_LINE,
  timestamp: 'initial',
};

export const ZED_QUICK_SUGGESTIONS = Object.freeze([
  'Abrí una terminal y ejecutá ls',
  '¿Qué terminales hay?',
  'Abrí github.com en pizarra',
]);

/**
 * @typedef {{ tool: string, label: string, status: 'running'|'ok'|'error', input?: object, result?: unknown }} ZedCurrentStep
 */

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

export function selectLastToolType(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const result = m && Array.isArray(m.tool_results) ? m.tool_results : [];
    if (result.length === 0) continue;
    return extractToolType(m);
  }
  return null;
}

export function useZedChat({
  sessionKey = 'devhub-zed-chat-default',
  getTerminalPanelCount = null,
  getWorkspaceTerminals = null,
  streamEnabled = true,
} = {}) {
  const [messages, setMessages] = useState(() => [DEFAULT_ZED_GREETING]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [activityExpanded, setActivityExpanded] = useState(() =>
    Boolean(getZedPreference('activityExpanded', false))
  );
  const [pendingApproval, setPendingApproval] = useState(null);
  const [auditTrail, setAuditTrail] = useState(() => readZedAuditTrail());
  const [metrics, setMetrics] = useState(() => getMetricsSummary());
  const [agentStatus, setAgentStatusState] = useState(() => getZedAgentStatus());
  const [requestContext, setRequestContext] = useState({
    terminal_panel_count: 0,
    max_terminal_panels: MAX_ZED_TERMINAL_PANELS,
    workspace_terminals: [],
  });
  const [streamingMessage, setStreamingMessage] = useState(null);
  const textareaRef = useRef(null);
  const dispatchedSessionIdsRef = useRef(new Set());
  const lastDispatchedTypeRef = useRef(null);
  const hydratedOpenTerminalRef = useRef(null);
  const pendingPlanIdRef = useRef(null);
  const streamingIdRef = useRef(null);

  const planRunner = useZedPlanRunner({ context: requestContext });

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && typeof m.content === 'string');

  const lastToolType = selectLastToolType(messages);

  const dispatchOpts = useCallback(
    () => ({
      getTerminalPanelCount,
      dispatchedKeys: dispatchedSessionIdsRef.current,
    }),
    [getTerminalPanelCount]
  );

  const processToolResults = useCallback(
    (toolResults, { partial = false } = {}) => {
      if (!Array.isArray(toolResults) || toolResults.length === 0) return;
      dispatchAllZedToolResults(toolResults, dispatchOpts());
      for (const entry of toolResults) {
        const raw = entry.result;
        let parsed = raw;
        if (typeof raw === 'string') {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = null;
          }
        }
        zedClientDebug('tool_result', { tool: entry.tool, partial, parsed });
        if (parsed?.error === 'command_requires_approval') {
          setPendingApproval({
            kind: 'command',
            tool: entry.tool,
            input: entry.input,
            command: parsed.command || parsed.full_command,
          });
          setActivityExpanded(true);
        }
      }
    },
    [dispatchOpts]
  );

  const sendToApi = useCallback(
    async (userMessage, { confirmPayload = null, confirmed = false, source = 'text' } = {}) => {
      const history = buildZedHistory(messages);
      const terminalPanelCount =
        typeof getTerminalPanelCount === 'function' ? Number(getTerminalPanelCount()) || 0 : 0;
      const workspaceTerminals =
        typeof getWorkspaceTerminals === 'function' ? getWorkspaceTerminals() : [];

      const body = {
        message: userMessage,
        history,
        stream: streamEnabled,
        confirmed: confirmed === true,
        source,
        context: {
          terminal_panel_count: terminalPanelCount,
          max_terminal_panels: MAX_ZED_TERMINAL_PANELS,
          workspace_terminals: Array.isArray(workspaceTerminals) ? workspaceTerminals : [],
        },
      };

      if (confirmPayload) {
        body.confirm_tool = confirmPayload;
      }

      setRequestContext(body.context);

      const ctrl = new AbortController();
      setAbortController(ctrl);

      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(streamEnabled ? { Accept: 'text/event-stream' } : {}),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const upstream = data?.upstream_status ? ` (upstream ${data.upstream_status})` : '';
        throw new Error(
          (typeof data?.error === 'string' && data.error) ||
            `Error del asistente: HTTP ${response.status}${upstream}`
        );
      }

      const contentType = response.headers.get('content-type') || '';
      if (streamEnabled && contentType.includes('text/event-stream') && response.body) {
        let finalText = '';
        let toolResults = [];
        const reader = response.body.getReader();
        let streamMeta = null;
        let streamModel = null;
        await consumeZedSseStream(reader, ({ event, data }) => {
          zedClientDebug('stream_event', { event, data });
          if (event === 'tool_start' && data && typeof data === 'object') {
            setCurrentStep({
              tool: data.tool,
              label: data.label || labelForZedToolStart(data.tool, data.input),
              status: 'running',
              input: data.input,
            });
          }
          if (event === 'tool_result' && data && typeof data === 'object') {
            setCurrentStep({
              tool: data.tool,
              label: data.label || data.tool,
              status: data.ok ? 'ok' : 'error',
              input: data.input,
              result: data.result,
            });
            dispatchAllZedToolResults(
              [{ tool: data.tool, input: data.input, result: data.result }],
              dispatchOpts()
            );
            if (data.ok) dispatchZedAuraOutcome('success');
            else dispatchZedAuraOutcome('error');
            toolResults.push({ tool: data.tool, input: data.input, result: data.result });
            processToolResults([{ tool: data.tool, input: data.input, result: data.result }], {
              partial: true,
            });
          }
          if (event === 'text_delta' && typeof data?.text === 'string') {
            finalText = data.text;
            if (!streamingIdRef.current) {
              streamingIdRef.current = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            }
            setStreamingMessage({
              role: 'assistant',
              content: data.text,
              timestamp: streamingIdRef.current,
              partial: true,
            });
          }
          if (event === 'done' && data && typeof data === 'object') {
            finalText = data.text || finalText;
            toolResults = Array.isArray(data.tool_results) ? data.tool_results : toolResults;
            streamMeta = data.meta || null;
            streamModel = data.model || null;
            streamingIdRef.current = null;
            setStreamingMessage(null);
            if (data.meta?.fast_path) {
              zedClientDebug('fast_path', { intent: data.meta.intent, model: data.model });
            }
            if (data.meta?.needs_confirmation) {
              setPendingApproval({
                kind: 'local_intent',
                message: userMessage,
                preview: data.text,
                meta: data.meta,
              });
              setActivityExpanded(true);
            }
          }
          if (event === 'error') {
            throw new Error(data?.message || 'Stream error');
          }
        });
        setCurrentStep(null);
        return { text: finalText, tool_results: toolResults, meta: streamMeta, model: streamModel };
      }

      const data = await response.json();
      if (data.meta?.needs_confirmation) {
        setPendingApproval({
          kind: 'local_intent',
          message: userMessage,
          preview: data.text,
          meta: data.meta,
        });
        setActivityExpanded(true);
        return data;
      }
      processToolResults(data.tool_results);
      if (data.tool_results?.length) {
        const hadError = data.tool_results.some((r) => {
          const p = typeof r.result === 'object' ? r.result : null;
          return p?.error;
        });
        dispatchZedAuraOutcome(hadError ? 'error' : 'success');
      }
      return data;
    },
    [
      dispatchOpts,
      getTerminalPanelCount,
      getWorkspaceTerminals,
      messages,
      processToolResults,
      streamEnabled,
    ]
  );

  const setAgentStatus = useCallback((status, currentTaskId = null) => {
    setZedAgentStatus(status, currentTaskId);
    setAgentStatusState({ status, currentTaskId });
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    const securityCheck = detectMaliciousPrompt(userMessage);
    if (securityCheck.blocked) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
        {
          role: 'assistant',
          content: `No puedo procesar ese mensaje: ${securityCheck.reason}`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setInput('');
      dispatchZedAuraOutcome('error');
      return;
    }

    setInput('');
    setIsLoading(true);
    setPendingApproval(null);
    setAgentStatus('working');

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
    ]);

    const roundTripStart = Date.now();
    let roundTripRecorded = false;

    try {
      const data = await sendToApi(userMessage);
      const durationMs = Date.now() - roundTripStart;
      const fastPath = Boolean(data.meta?.fast_path || data.model === 'zed-fast-path');
      recordChatRoundTrip({
        durationMs,
        model: data.model || null,
        fastPath,
        error: false,
        source: 'text',
      });
      roundTripRecorded = true;

      if (data.meta?.needs_confirmation) {
        const pendingSteps = data.meta?.pending_steps;
        if (Array.isArray(pendingSteps) && pendingSteps.length > 0) {
          pendingPlanIdRef.current = addZedPendingPlan({
            message: userMessage,
            steps: pendingSteps,
            meta: data.meta,
          });
          setPendingApproval({
            kind: 'plan',
            message: userMessage,
            preview: data.text || '¿Confirmás este plan de acciones?',
            steps: pendingSteps,
            meta: data.meta,
          });
          setActivityExpanded(true);
        }
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.text || '¿Confirmás esta acción?',
            timestamp: new Date().toISOString(),
            meta: data.meta,
          },
        ]);
        return;
      }
      const flaggedTools = Array.isArray(data.tool_results)
        ? data.tool_results.map((t) => ({
            ...t,
            fast_path: fastPath,
          }))
        : data.tool_results;
      recordZedInteraction(userMessage, flaggedTools, data.text || '');
      for (const tool of flaggedTools || []) {
        const memoryTools = [
          'create_plan',
          'execute_plan',
          'launch_agent_session',
          'create_task',
          'create_milestone',
        ];
        if (memoryTools.includes(tool.tool)) {
          recordZedMemoryAction({
            type: 'agent_action',
            tool: tool.tool,
            input: tool.input,
            result: tool.result,
          });
        }
      }
      if (fastPath) {
        zedClientDebug('fast_path', { intent: data.meta?.intent });
      }
      setAuditTrail(readZedAuditTrail());
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
      if (!roundTripRecorded) {
        const durationMs = Date.now() - roundTripStart;
        recordChatRoundTrip({ durationMs, error: true, source: 'text' });
      }
      streamingIdRef.current = null;
      setStreamingMessage(null);
      const aborted = error?.name === 'AbortError';
      const content = aborted
        ? '(Solicitud cancelada)'
        : formatToolErrorForUser('chat', error).message;
      dispatchZedAuraOutcome('error');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
      setAbortController(null);
      setCurrentStep(null);
      setAgentStatus('idle');
    }
  }, [input, isLoading, sendToApi, setAgentStatus, dispatchZedAuraOutcome]);

  const handleApproveCommand = useCallback(async () => {
    if (!pendingApproval || isLoading) return;
    const { tool, input: toolInput, kind = 'command' } = pendingApproval;

    if (kind === 'plan' && Array.isArray(pendingApproval.steps)) {
      setPendingApproval(null);
      if (pendingPlanIdRef.current) {
        removeZedPendingPlan(pendingPlanIdRef.current);
        pendingPlanIdRef.current = null;
      }
      setIsLoading(true);
      try {
        const result = await planRunner.runPlan(pendingApproval.steps, {
          onComplete: (plan) => {
            const toolResults = plan.map((s) => ({
              tool: s.tool,
              input: s.input,
              result: s.result,
            }));
            recordZedInteraction(pendingApproval.message, toolResults, 'Plan completado.');
            setAuditTrail(readZedAuditTrail());
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: 'Plan completado.',
                timestamp: new Date().toISOString(),
                tool_results: toolResults,
              },
            ]);
            dispatchZedAuraOutcome('success');
          },
        });
        if (result.state === PLAN_EXECUTOR_STATES.AWAITING_HUMAN && result.step) {
          setPendingApproval({
            kind: 'plan_step',
            step: result.step,
            message: pendingApproval.message,
          });
          setActivityExpanded(true);
        } else if (result.state !== PLAN_EXECUTOR_STATES.COMPLETED) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `El plan se detuvo: ${result.state}.`,
              timestamp: new Date().toISOString(),
            },
          ]);
          dispatchZedAuraOutcome('error');
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: formatToolErrorForUser('plan', error).message,
            timestamp: new Date().toISOString(),
          },
        ]);
        dispatchZedAuraOutcome('error');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (kind === 'plan_step') {
      setIsLoading(true);
      try {
        const result = await planRunner.approveStep();
        if (result.state === PLAN_EXECUTOR_STATES.AWAITING_HUMAN && result.step) {
          setPendingApproval({
            kind: 'plan_step',
            step: result.step,
            message: pendingApproval.message,
          });
        } else if (result.state === PLAN_EXECUTOR_STATES.COMPLETED) {
          setPendingApproval(null);
          const plan = planRunner.planResults || [];
          const toolResults = plan.map((s) => ({
            tool: s.tool,
            input: s.input,
            result: s.result,
          }));
          recordZedInteraction(pendingApproval.message, toolResults, 'Plan completado.');
          setAuditTrail(readZedAuditTrail());
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: 'Plan completado.',
              timestamp: new Date().toISOString(),
              tool_results: toolResults,
            },
          ]);
          dispatchZedAuraOutcome('success');
        } else if (result.state !== PLAN_EXECUTOR_STATES.COMPLETED) {
          setPendingApproval(null);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `El plan se detuvo: ${result.state}.`,
              timestamp: new Date().toISOString(),
            },
          ]);
          dispatchZedAuraOutcome('error');
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: formatToolErrorForUser('plan', error).message,
            timestamp: new Date().toISOString(),
          },
        ]);
        dispatchZedAuraOutcome('error');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (kind === 'local_intent') {
      setIsLoading(true);
      const roundTripStart = Date.now();
      let roundTripRecorded = false;

      try {
        const data = await sendToApi(pendingApproval.message, { confirmed: true });
        const durationMs = Date.now() - roundTripStart;
        const fastPath = Boolean(data.meta?.fast_path || data.model === 'zed-fast-path');
        recordChatRoundTrip({
          durationMs,
          model: data.model || null,
          fastPath,
          error: false,
          source: 'text',
        });
        roundTripRecorded = true;

        setPendingApproval(null);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.text || 'Listo.',
            timestamp: new Date().toISOString(),
            tool_results: data.tool_results,
          },
        ]);
        processToolResults(data.tool_results);
        dispatchZedAuraOutcome('success');
      } catch (error) {
        if (!roundTripRecorded) {
          const durationMs = Date.now() - roundTripStart;
          recordChatRoundTrip({ durationMs, error: true, source: 'text' });
        }
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: formatToolErrorForUser('chat', error).message,
            timestamp: new Date().toISOString(),
          },
        ]);
        dispatchZedAuraOutcome('error');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    try {
      const history = buildZedHistory(messages);
      const confirmInput = { ...toolInput, confirm: true };
      const confirmMessage = `Confirmo ejecutar: ${toolInput?.input || toolInput?.command || pendingApproval.command}`;
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: confirmMessage,
          history,
          context: {
            terminal_panel_count:
              typeof getTerminalPanelCount === 'function'
                ? Number(getTerminalPanelCount()) || 0
                : 0,
            max_terminal_panels: MAX_ZED_TERMINAL_PANELS,
            workspace_terminals:
              typeof getWorkspaceTerminals === 'function' ? getWorkspaceTerminals() : [],
          },
          confirm_tool: {
            tool,
            input: confirmInput,
          },
        }),
      });
      const data = await response.json();
      processToolResults(data.tool_results);
      recordZedInteraction(confirmMessage, data.tool_results, data.text || 'Comando aprobado.');
      setAuditTrail(readZedAuditTrail());
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.text || 'Comando aprobado.',
          timestamp: new Date().toISOString(),
          tool_results: data.tool_results,
        },
      ]);
      setPendingApproval(null);
      dispatchZedAuraOutcome('success');
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: formatToolErrorForUser('chat', error).message,
          timestamp: new Date().toISOString(),
        },
      ]);
      dispatchZedAuraOutcome('error');
    } finally {
      setIsLoading(false);
    }
  }, [
    getTerminalPanelCount,
    getWorkspaceTerminals,
    isLoading,
    messages,
    pendingApproval,
    planRunner,
    PLAN_EXECUTOR_STATES,
    processToolResults,
    sendToApi,
  ]);

  const sendFromVoice = useCallback(
    async (transcript) => {
      const text = typeof transcript === 'string' ? transcript.trim() : '';
      if (!text || isLoading) return;

      setIsLoading(true);
      setPendingApproval(null);
      setAgentStatus('working');
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text, timestamp: new Date().toISOString(), source: 'voice' },
      ]);

      const roundTripStart = Date.now();
      let roundTripRecorded = false;

      try {
        const data = await sendToApi(text, { source: 'voice' });
        const durationMs = Date.now() - roundTripStart;
        const fastPath = Boolean(data.meta?.fast_path || data.model === 'zed-fast-path');
        recordChatRoundTrip({
          durationMs,
          model: data.model || null,
          fastPath,
          error: false,
          source: 'voice',
        });
        roundTripRecorded = true;

        if (data.meta?.needs_confirmation) {
          setPendingApproval({
            kind: 'local_intent',
            message: text,
            preview: data.text,
            meta: data.meta,
          });
          setActivityExpanded(true);
          return;
        }
        recordZedInteraction(text, data.tool_results, data.text || '');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.text || 'No pude procesar tu mensaje.',
            timestamp: new Date().toISOString(),
            tool_results: data.tool_results,
          },
        ]);
        processToolResults(data.tool_results);
        setAuditTrail(readZedAuditTrail());
      } catch (error) {
        if (!roundTripRecorded) {
          const durationMs = Date.now() - roundTripStart;
          recordChatRoundTrip({ durationMs, error: true, source: 'voice' });
        }
        const content = formatToolErrorForUser('chat', error).message;
        dispatchZedAuraOutcome('error');
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content, timestamp: new Date().toISOString() },
        ]);
      } finally {
        setIsLoading(false);
        setAbortController(null);
        setCurrentStep(null);
        setAgentStatus('idle');
      }
    },
    [isLoading, processToolResults, sendToApi, setAgentStatus]
  );

  const [voiceSettings, setVoiceSettings] = useState(() => readVoiceSettings());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = () => setVoiceSettings(readVoiceSettings());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleRejectApproval = useCallback(() => {
    setPendingApproval(null);
    if (pendingPlanIdRef.current) {
      removeZedPendingPlan(pendingPlanIdRef.current);
      pendingPlanIdRef.current = null;
    }
  }, []);

  const handleStop = useCallback(() => {
    abortController?.abort();
    setIsLoading(false);
    setCurrentStep(null);
    streamingIdRef.current = null;
    setStreamingMessage(null);
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

  const applySuggestion = useCallback((text) => {
    setInput(text);
    setActivityExpanded(true);
  }, []);

  useEffect(() => {
    hydratedOpenTerminalRef.current = null;
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
      // ignore
    }
  }, [messages, sessionKey]);

  useEffect(() => {
    setZedPreference('activityExpanded', activityExpanded);
  }, [activityExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateMetrics = () => setMetrics(getMetricsSummary());
    updateMetrics();
    const id = setInterval(updateMetrics, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (lastDispatchedTypeRef.current === lastToolType) return;
    lastDispatchedTypeRef.current = lastToolType;
    dispatchZedAuraToolType(lastToolType);
  }, [lastToolType]);

  useEffect(() => {
    if (typeof window === 'undefined' || !sessionKey) return;
    if (hydratedOpenTerminalRef.current === sessionKey) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.tool_results?.some((r) => r.tool === 'open_terminal')) {
        dispatchAllZedToolResults(msg.tool_results, dispatchOpts());
        hydratedOpenTerminalRef.current = sessionKey;
        break;
      }
    }
  }, [dispatchOpts, messages, sessionKey]);

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
    lastToolType,
    currentStep,
    activityExpanded,
    setActivityExpanded,
    pendingApproval,
    handleApproveCommand,
    handleRejectApproval,
    applySuggestion,
    quickSuggestions: ZED_QUICK_SUGGESTIONS,
    auditTrail,
    sendFromVoice,
    voiceSettings,
    metrics,
    agentStatus,
    streamingMessage,
    planState: planRunner.planState,
    planControls: {
      pause: planRunner.pause,
      resume: planRunner.resume,
      abort: planRunner.abort,
    },
    planResults: planRunner.planResults,
    pendingStepApproval: planRunner.pendingStepApproval,
  };
}
