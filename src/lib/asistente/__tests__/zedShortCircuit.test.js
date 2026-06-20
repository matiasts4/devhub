/**
 * @jest-environment jsdom
 */

import { shouldShortCircuitAfterTools } from '../zedShortCircuit';

describe('shouldShortCircuitAfterTools', () => {
  test('returns false for empty results', () => {
    expect(shouldShortCircuitAfterTools([])).toBe(false);
    expect(shouldShortCircuitAfterTools(null)).toBe(false);
  });

  test('returns true for list_terminals with processes', () => {
    expect(
      shouldShortCircuitAfterTools([{ tool: 'list_terminals', result: { processes: [] } }])
    ).toBe(true);
  });

  test('returns true for open_terminal with terminalId', () => {
    expect(
      shouldShortCircuitAfterTools([{ tool: 'open_terminal', result: { terminalId: 't1' } }])
    ).toBe(true);
  });

  test('returns false when one result is not short-circuitable', () => {
    expect(
      shouldShortCircuitAfterTools([
        { tool: 'open_terminal', result: { terminalId: 't1' } },
        { tool: 'create_task', result: { created: true } },
      ])
    ).toBe(false);
  });

  test('returns true for command requiring approval', () => {
    expect(
      shouldShortCircuitAfterTools([
        { tool: 'execute_in_terminal', result: { error: 'command_requires_approval' } },
      ])
    ).toBe(true);
  });

  test('returns false for generic error', () => {
    expect(
      shouldShortCircuitAfterTools([{ tool: 'open_terminal', result: { error: 'boom' } }])
    ).toBe(false);
  });
});
