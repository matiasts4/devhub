/**
 * "¿Qué respondió el agente?" — detección de contenido por terminal.
 *
 * Covers:
 *   - resolveAgentResponseIntent via resolveZedFastPathIntent: routes
 *     "qué respondió kimi / el agente" to summarize_terminal on the panel
 *     that runs that program (workspace_terminals[].program).
 *   - explicit "en <name>" wins over program lookup
 *   - ambiguity (two panels with same program) → null (LLM decides)
 *   - open/close verbs never hijacked ("abre kimi" keeps launching)
 *   - formatZedFastPathReply now formats summarize_terminal /
 *     review_terminal_output digests instead of replying "Listo."
 */

'use strict';

const { resolveZedFastPathIntent } = require('../zedFastPath');
const { formatZedFastPathReply } = require('../zedFastPathResponse');

const TERMINALS = [
  { terminalId: 'p1', displayName: 'Chase', program: 'kimi' },
  { terminalId: 'p3', displayName: 'Cesar' },
];

describe('agent response intent → summarize_terminal', () => {
  test('"¿qué me respondió kimi?" targets the panel running kimi', () => {
    const hit = resolveZedFastPathIntent('¿qué me respondió kimi?', {
      workspace_terminals: TERMINALS,
    });
    expect(hit).toMatchObject({
      intent: 'summarize_terminal',
      matched: 'agent_response',
      steps: [{ tool: 'summarize_terminal', input: { name: 'Chase', program: 'kimi' } }],
    });
    expect(hit.confidence).toBeGreaterThanOrEqual(0.85);
  });

  test('"que respondio el agente" resolves when exactly one panel runs a program', () => {
    const hit = resolveZedFastPathIntent('que respondio el agente', {
      workspace_terminals: TERMINALS,
    });
    expect(hit).toMatchObject({
      intent: 'summarize_terminal',
      steps: [{ tool: 'summarize_terminal', input: { name: 'Chase' } }],
    });
  });

  test('"cómo va kimi" also routes to summarize_terminal', () => {
    const hit = resolveZedFastPathIntent('cómo va kimi', {
      workspace_terminals: TERMINALS,
    });
    expect(hit).toMatchObject({
      intent: 'summarize_terminal',
      steps: [{ tool: 'summarize_terminal', input: { name: 'Chase', program: 'kimi' } }],
    });
  });

  test('explicit "en Cesar" wins over program lookup', () => {
    const hit = resolveZedFastPathIntent('¿qué respondió kimi en Cesar?', {
      workspace_terminals: TERMINALS,
    });
    expect(hit).toMatchObject({
      intent: 'summarize_terminal',
      steps: [{ tool: 'summarize_terminal', input: { name: 'Cesar', program: 'kimi' } }],
    });
  });

  test('two panels running the same program → null (defer to LLM)', () => {
    const hit = resolveZedFastPathIntent('¿qué respondió kimi?', {
      workspace_terminals: [
        { terminalId: 'p1', displayName: 'Chase', program: 'kimi' },
        { terminalId: 'p2', displayName: 'Avery', program: 'kimi' },
      ],
    });
    expect(hit).toBeNull();
  });

  test('"el agente" with no program info and multiple panels → null', () => {
    const hit = resolveZedFastPathIntent('que respondio el agente', {
      workspace_terminals: [
        { terminalId: 'p1', displayName: 'Chase' },
        { terminalId: 'p3', displayName: 'Cesar' },
      ],
    });
    expect(hit).toBeNull();
  });

  test('single panel fallback: "que dijo el agente" with one terminal', () => {
    const hit = resolveZedFastPathIntent('que dijo el agente', {
      workspace_terminals: [{ terminalId: 'p1', displayName: 'Chase' }],
    });
    expect(hit).toMatchObject({
      intent: 'summarize_terminal',
      steps: [{ tool: 'summarize_terminal', input: { name: 'Chase' } }],
    });
  });

  test('"abre kimi" is NOT hijacked by the response intent', () => {
    const hit = resolveZedFastPathIntent('abre una terminal nueva con kimi', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.intent).toBe('open_terminal_agent');
    expect(hit?.steps[0]).toMatchObject({ tool: 'open_terminal', input: { program: 'kimi' } });
  });

  test('"¿qué dijo la terminal Chase?" (terminal noun + response verb) → summarize named', () => {
    const hit = resolveZedFastPathIntent('¿qué dijo la terminal Chase?', {
      workspace_terminals: TERMINALS,
    });
    expect(hit?.intent).toBe('summarize_terminal');
    expect(hit?.steps[0]?.input?.name).toBe('Chase');
  });
});

describe('formatZedFastPathReply — summarize/review content', () => {
  test('summarize digest with tail quotes the last lines (no more "Listo.")', () => {
    const reply = formatZedFastPathReply('summarize_terminal', {
      terminalId: 'p1',
      displayName: 'Chase',
      status: 'unknown',
      tail: 'línea vieja\n\nEl agente dijo: terminé la tarea 14\nTodo verde.',
      capturedAt: 1,
    });
    expect(reply).not.toBe('Listo.');
    expect(reply).toContain('Chase');
    expect(reply).toContain('terminé la tarea 14');
    expect(reply).toContain('Todo verde.');
  });

  test('summarize digest waiting_user_input surfaces waitingFor', () => {
    const reply = formatZedFastPathReply('summarize_terminal', {
      terminalId: 'p1',
      displayName: 'Chase',
      status: 'waiting_user_input',
      waitingFor: 'Choose: [1] sí [2] no',
      tail: 'blah\nChoose: [1] sí [2] no',
      capturedAt: 1,
    });
    expect(reply).toContain('esperando tu input');
    expect(reply).toContain('Choose: [1]');
  });

  test('summarize digest without tail reports no recent output', () => {
    const reply = formatZedFastPathReply('summarize_terminal', {
      terminalId: 'p9',
      displayName: 'Avery',
      status: 'unknown',
      capturedAt: 1,
    });
    expect(reply).toBe('No veo salida reciente en Avery.');
  });

  test('review_terminal_output quotes recent content', () => {
    const reply = formatZedFastPathReply('review_terminal_output', {
      output: 'npm test\n\n42 passing\n0 failing',
      session_id: 'p1',
      displayName: 'Chase',
    });
    expect(reply).toContain('Chase');
    expect(reply).toContain('42 passing');
  });

  test('review_terminal_output with empty output says so', () => {
    const reply = formatZedFastPathReply('review_terminal_output', {
      output: '',
      session_id: 'p1',
    });
    expect(reply).toBe('La terminal p1 no tiene salida reciente.');
  });
});
