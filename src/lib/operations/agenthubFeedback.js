import { createOperationalEvent } from '@/lib/operations/contracts';
import { persistOperationalEvent } from '@/lib/operations/events';
import { dispatchOperationalNotification } from '@/lib/operations/notify';

function buildToolSummary(traces = []) {
  const completed = traces.filter(
    (trace) => trace.type === 'tool' && trace.toolStatus === 'completed'
  );
  const failed = traces.filter((trace) => trace.type === 'tool' && trace.toolStatus === 'error');

  const toolsDone = completed.length
    ? `Usó ${completed.length} herramienta${completed.length !== 1 ? 's' : ''}: ${[
        ...new Set(completed.map((trace) => trace.toolName).filter(Boolean)),
      ].join(', ')}.`
    : 'No usó herramientas.';

  const errorNote = failed.length
    ? ` ${failed.length} herramienta${failed.length !== 1 ? 's' : ''} con error.`
    : '';

  return { toolsDone, errorNote };
}

function buildOutputSection(textOutput = '') {
  const normalized = String(textOutput || '').trim();
  if (!normalized) return '';
  const body = normalized.slice(0, 3500);
  const suffix = normalized.length > 3500 ? '\n…(truncado)' : '';
  return `\n\nResultado de la ejecución:\n${body}${suffix}`;
}

export function buildSubagentOperationalFeedback(input = {}) {
  const {
    projectId,
    agentName,
    status,
    sessionID,
    childSessionId,
    messageId,
    errorMessage,
    traces = [],
    textOutput = '',
  } = input;
  const normalizedAgent = agentName || 'subagente';
  const isError = status === 'error' || status === 'failed' || status === 'aborted';
  const { toolsDone, errorNote } = buildToolSummary(traces);
  const outputSection = buildOutputSection(textOutput);
  const eventType = isError ? 'subagent.failed' : 'subagent.completed';
  const title = isError
    ? `${normalizedAgent} finalizó con errores`
    : `${normalizedAgent} finalizó su ejecución`;
  const body = isError
    ? `${toolsDone}${errorNote}${errorMessage ? ` Error: ${errorMessage}` : ''}${outputSection}`
    : `${toolsDone}${errorNote}${outputSection}`;

  const injectionMessage = isError
    ? `[SYSTEM NOTIFICATION]: El sub-agente "${normalizedAgent}" finalizó con errores.\n${toolsDone}${errorMessage ? `\nError: ${errorMessage}` : ''}${outputSection}`
    : `[SYSTEM NOTIFICATION]: El sub-agente "${normalizedAgent}" ha finalizado su ejecución.\n${toolsDone}${errorNote}${outputSection}\n\nPor favor, analizá este resultado y presentá al usuario los hallazgos principales de forma clara y estructurada.`;

  const event = createOperationalEvent({
    event_type: eventType,
    severity: isError ? 'critical' : 'info',
    source: 'agenthub',
    source_authority: 'authoritative',
    title,
    body,
    delivery: { desktop: true, in_app: true },
    dedupe_parts: [sessionID, normalizedAgent, messageId],
    metadata: {
      project_id: projectId || null,
      session_id: sessionID || null,
      child_session_id: childSessionId || null,
      agent_name: normalizedAgent,
      error_message: errorMessage || null,
    },
  });

  return { event, injectionMessage };
}

export async function emitSubagentOperationalFeedback(input = {}, dependencies = {}) {
  const dispatch = dependencies.dispatchOperationalNotification || dispatchOperationalNotification;
  const persist = dependencies.persistOperationalEvent || persistOperationalEvent;
  const feedback = buildSubagentOperationalFeedback(input);
  const notification = await dispatch(feedback.event);

  if (notification?.event && notification.event.delivery?.in_app !== false) {
    persist(notification.event, { dispatch: true });
  }

  return {
    ...feedback,
    notification,
  };
}
