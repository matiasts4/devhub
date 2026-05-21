describe('agenthub stream parser', () => {
  test('parses newline-delimited usage events', async () => {
    const { createAgentHubStreamParser } = require('../../src/lib/agenthubStream');

    const events = [];
    const malformed = [];
    const parser = createAgentHubStreamParser({
      onEvent: (event) => events.push(event),
      onMalformedLine: (line) => malformed.push(line),
    });

    parser.push(
      `${JSON.stringify({ type: 'meta', model_used: 'gpt-test' })}\n${JSON.stringify({ type: 'usage', usage: { total_tokens: 42 } })}\n`
    );

    expect(events).toEqual([
      { type: 'meta', model_used: 'gpt-test' },
      { type: 'usage', usage: { total_tokens: 42 } },
    ]);
    expect(malformed).toEqual([]);
  });

  test('flushes a trailing usage event without final newline', async () => {
    const { createAgentHubStreamParser } = require('../../src/lib/agenthubStream');

    const events = [];
    const malformed = [];
    const parser = createAgentHubStreamParser({
      onEvent: (event) => events.push(event),
      onMalformedLine: (line) => malformed.push(line),
    });

    parser.push(
      '{"type":"chunk","content":"Hola"}\n{"type":"usage","usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}}'
    );
    parser.flush();

    expect(events).toEqual([
      { type: 'chunk', content: 'Hola' },
      {
        type: 'usage',
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
        },
      },
    ]);
    expect(malformed).toEqual([]);
  });

  test('reconstructs usage events split across arbitrary chunks', async () => {
    const { createAgentHubStreamParser } = require('../../src/lib/agenthubStream');

    const events = [];
    const parser = createAgentHubStreamParser({
      onEvent: (event) => events.push(event),
    });

    parser.push('{"type":"us');
    parser.push('age","usage":{"prompt_tokens":3,');
    parser.push('"completion_tokens":2,"total_tokens":5}}\n');

    expect(events).toEqual([
      {
        type: 'usage',
        usage: {
          prompt_tokens: 3,
          completion_tokens: 2,
          total_tokens: 5,
        },
      },
    ]);
  });

  test('ignores malformed lines without dropping later usage events', async () => {
    const { createAgentHubStreamParser } = require('../../src/lib/agenthubStream');

    const events = [];
    const malformed = [];
    const parser = createAgentHubStreamParser({
      onEvent: (event) => events.push(event),
      onMalformedLine: (line) => malformed.push(line),
    });

    parser.push('not-json\n');
    parser.push('{"type":"usage","usage":{"total_tokens":99}}');
    parser.flush();

    expect(malformed).toEqual(['not-json']);
    expect(events).toEqual([{ type: 'usage', usage: { total_tokens: 99 } }]);
  });
});
