'use strict';

const { selectLastToolType } = require('../useZedChat');

describe('selectLastToolType (pure helper exported from useZedChat.js)', () => {
  test('returns null for null/undefined input', () => {
    expect(selectLastToolType(null)).toBeNull();
    expect(selectLastToolType(undefined)).toBeNull();
  });

  test('returns null for non-array input', () => {
    expect(selectLastToolType('not an array')).toBeNull();
    expect(selectLastToolType(42)).toBeNull();
    expect(selectLastToolType({})).toBeNull();
  });

  test('returns null for an empty messages array', () => {
    expect(selectLastToolType([])).toBeNull();
  });

  test('returns null when no message has tool_results', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    expect(selectLastToolType(messages)).toBeNull();
  });

  test('returns "terminal" when the last tool_results entry is a terminal tool', () => {
    const messages = [
      { role: 'user', content: 'open a terminal' },
      { role: 'assistant', content: '', tool_results: [{ tool: 'open_terminal' }] },
    ];
    expect(selectLastToolType(messages)).toBe('terminal');
  });

  test('returns "browser" when the last tool_results entry is open_url', () => {
    const messages = [{ role: 'assistant', content: '', tool_results: [{ tool: 'open_url' }] }];
    expect(selectLastToolType(messages)).toBe('browser');
  });

  test('returns "file" for unknown tools (catch-all bucket per ZAA-002)', () => {
    const messages = [
      { role: 'assistant', content: '', tool_results: [{ tool: 'list_terminals' }] },
    ];
    expect(selectLastToolType(messages)).toBe('file');
  });

  test('returns the most recent tool (last-wins) when multiple messages have tool_results', () => {
    const messages = [
      { role: 'assistant', content: '', tool_results: [{ tool: 'open_url' }] },
      { role: 'assistant', content: '', tool_results: [{ tool: 'open_terminal' }] },
    ];
    expect(selectLastToolType(messages)).toBe('terminal');
  });

  test('returns null when tool_results[0].tool is not a string', () => {
    const messages = [{ role: 'assistant', content: '', tool_results: [{}] }];
    expect(selectLastToolType(messages)).toBeNull();
  });
});
