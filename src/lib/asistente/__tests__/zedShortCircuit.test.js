/**
 * @jest-environment jsdom
 */

import {
  isLlmShortCircuitEnabled,
  matchesShortCircuitableResults,
  shouldShortCircuitAfterTools,
} from '../zedShortCircuit';

describe('shouldShortCircuitAfterTools', () => {
  const prevShortCircuit = process.env.ZED_LLM_SHORT_CIRCUIT;

  afterEach(() => {
    if (prevShortCircuit === undefined) delete process.env.ZED_LLM_SHORT_CIRCUIT;
    else process.env.ZED_LLM_SHORT_CIRCUIT = prevShortCircuit;
  });

  test('returns false for empty results', () => {
    expect(shouldShortCircuitAfterTools([])).toBe(false);
    expect(shouldShortCircuitAfterTools(null)).toBe(false);
  });

  test('returns true for list_terminals with processes', () => {
    delete process.env.ZED_LLM_SHORT_CIRCUIT;
    expect(
      shouldShortCircuitAfterTools([{ tool: 'list_terminals', result: { processes: [] } }])
    ).toBe(true);
  });

  test('returns true for open_terminal with terminalId', () => {
    delete process.env.ZED_LLM_SHORT_CIRCUIT;
    expect(
      shouldShortCircuitAfterTools([{ tool: 'open_terminal', result: { terminalId: 't1' } }])
    ).toBe(true);
  });

  test('returns false when one result is not short-circuitable', () => {
    delete process.env.ZED_LLM_SHORT_CIRCUIT;
    expect(
      shouldShortCircuitAfterTools([
        { tool: 'open_terminal', result: { terminalId: 't1' } },
        { tool: 'create_task', result: { created: true } },
      ])
    ).toBe(false);
  });

  test('returns true for command requiring approval', () => {
    delete process.env.ZED_LLM_SHORT_CIRCUIT;
    expect(
      shouldShortCircuitAfterTools([
        { tool: 'execute_in_terminal', result: { error: 'command_requires_approval' } },
      ])
    ).toBe(true);
  });

  test('returns false for generic error', () => {
    delete process.env.ZED_LLM_SHORT_CIRCUIT;
    expect(
      shouldShortCircuitAfterTools([{ tool: 'open_terminal', result: { error: 'boom' } }])
    ).toBe(false);
  });

  test('ZED_LLM_SHORT_CIRCUIT=0 disables short-circuit (LLM-only mode)', () => {
    process.env.ZED_LLM_SHORT_CIRCUIT = '0';
    expect(isLlmShortCircuitEnabled()).toBe(false);
    const results = [{ tool: 'list_terminals', result: { processes: [] } }];
    expect(matchesShortCircuitableResults(results)).toBe(true);
    expect(shouldShortCircuitAfterTools(results)).toBe(false);
  });
});
