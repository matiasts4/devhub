const {
  toOpenAiTools,
  toOpenAiMessages,
  fromOpenAiMessage,
  parseToolCallArguments,
} = require('../zedConversationAdapter');

describe('toOpenAiTools', () => {
  test('wraps Anthropic input_schema as OpenAI function tool defs', () => {
    const result = toOpenAiTools([
      {
        name: 'list_terminals',
        description: 'List terminals',
        input_schema: { type: 'object', properties: {} },
      },
    ]);
    expect(result).toEqual([
      {
        type: 'function',
        function: {
          name: 'list_terminals',
          description: 'List terminals',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
  });

  test('defaults missing description/input_schema', () => {
    const result = toOpenAiTools([{ name: 'noop' }]);
    expect(result).toEqual([
      {
        type: 'function',
        function: { name: 'noop', description: '', parameters: { type: 'object', properties: {} } },
      },
    ]);
  });

  test('empty/undefined input returns empty array', () => {
    expect(toOpenAiTools()).toEqual([]);
    expect(toOpenAiTools([])).toEqual([]);
  });

  test('strips property-level required:true into object-level required[] (xAI JSON Schema)', () => {
    const result = toOpenAiTools([
      {
        name: 'review_terminal_output',
        description: 'Read terminal',
        input_schema: {
          type: 'object',
          properties: {
            session_id: { type: 'string', required: true, description: 'id' },
            name: { type: 'string', description: 'display' },
          },
          required: ['session_id'],
        },
      },
    ]);
    const params = result[0].function.parameters;
    expect(params.properties.session_id.required).toBeUndefined();
    expect(params.properties.session_id).toEqual({
      type: 'string',
      description: 'id',
    });
    expect(params.required).toEqual(['session_id']);
  });
});

describe('toOpenAiMessages', () => {
  test('prepends system message when provided', () => {
    const result = toOpenAiMessages('You are Zed.', [{ role: 'user', content: 'hi' }]);
    expect(result[0]).toEqual({ role: 'system', content: 'You are Zed.' });
    expect(result[1]).toEqual({ role: 'user', content: 'hi' });
  });

  test('omits system message when not provided', () => {
    const result = toOpenAiMessages(undefined, [{ role: 'user', content: 'hi' }]);
    expect(result).toEqual([{ role: 'user', content: 'hi' }]);
  });

  test('translates assistant tool_use blocks into tool_calls', () => {
    const result = toOpenAiMessages(undefined, [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking...' },
          { type: 'tool_use', id: 'call_1', name: 'list_terminals', input: { foo: 'bar' } },
        ],
      },
    ]);
    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'Checking...',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'list_terminals', arguments: '{"foo":"bar"}' },
          },
        ],
      },
    ]);
  });

  test('assistant with only tool_use blocks gets null content', () => {
    const result = toOpenAiMessages(undefined, [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'noop', input: {} }] },
    ]);
    expect(result[0].content).toBeNull();
  });

  test('translates tool_result blocks into role:tool messages', () => {
    const result = toOpenAiMessages(undefined, [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_1', content: '{"ok":true}' },
          { type: 'tool_result', tool_use_id: 'call_2', content: { ok: false } },
        ],
      },
    ]);
    expect(result).toEqual([
      { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
      { role: 'tool', tool_call_id: 'call_2', content: '{"ok":false}' },
    ]);
  });

  test('flattens unknown block arrays to plain text as a fallback', () => {
    const result = toOpenAiMessages(undefined, [
      { role: 'user', content: [{ type: 'text', text: 'plain block text' }] },
    ]);
    expect(result).toEqual([{ role: 'user', content: 'plain block text' }]);
  });
});

describe('fromOpenAiMessage', () => {
  test('text-only message becomes a single text block', () => {
    expect(fromOpenAiMessage({ content: 'hello' })).toEqual([{ type: 'text', text: 'hello' }]);
  });

  test('tool_calls become tool_use blocks with parsed input', () => {
    const result = fromOpenAiMessage({
      content: null,
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'echo', arguments: '{"value":"hi"}' } },
      ],
    });
    expect(result).toEqual([
      { id: 'call_1', type: 'tool_use', name: 'echo', input: { value: 'hi' } },
    ]);
  });

  test('handles both text and tool_calls together', () => {
    const result = fromOpenAiMessage({
      content: 'Checking...',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'noop', arguments: '{}' } }],
    });
    expect(result).toEqual([
      { type: 'text', text: 'Checking...' },
      { id: 'call_1', type: 'tool_use', name: 'noop', input: {} },
    ]);
  });

  test('empty message returns empty content array', () => {
    expect(fromOpenAiMessage({})).toEqual([]);
    expect(fromOpenAiMessage()).toEqual([]);
  });
});

describe('parseToolCallArguments', () => {
  test('parses valid JSON', () => {
    expect(parseToolCallArguments('{"a":1}')).toEqual({ a: 1 });
  });

  test('returns empty object for empty/undefined input', () => {
    expect(parseToolCallArguments('')).toEqual({});
    expect(parseToolCallArguments(undefined)).toEqual({});
    expect(parseToolCallArguments('   ')).toEqual({});
  });

  test('returns _parse_error wrapper for malformed JSON', () => {
    expect(parseToolCallArguments('{bad json')).toEqual({ _parse_error: '{bad json' });
  });
});
