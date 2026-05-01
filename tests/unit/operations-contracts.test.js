const {
  buildOperationalDedupeKey,
  createHealthSource,
  createOperationalEvent,
  normalizeLegacySubagentLifecycleEvent,
} = require('../../src/lib/operations/contracts');

describe('operations contracts', () => {
  test('creates canonical critical lifecycle events with stable dedupe semantics', () => {
    const event = createOperationalEvent({
      event_type: 'subagent.failed',
      severity: 'critical',
      source: 'agenthub',
      source_authority: 'authoritative',
      occurred_at: '2026-04-10T17:00:00.000Z',
      title: 'Claude failed',
      delivery: { desktop: true },
      dedupe_parts: ['session-1', 'claude'],
    });

    expect(event.severity).toBe('critical');
    expect(event.source_authority).toBe('authoritative');
    expect(event.dedupe_key).toBe('agenthub:subagent.failed:session-1:claude');
    expect(event.delivery).toEqual({ desktop: true, in_app: true });
  });

  test('legacy subagent lifecycle events normalize into canonical failed events', () => {
    const event = normalizeLegacySubagentLifecycleEvent({
      agent: 'claude',
      status: 'error',
      sessionID: 'child-7',
      messageId: 'msg-9',
      errorMessage: 'Tool execution failed',
      occurredAt: '2026-04-10T17:05:00.000Z',
    });

    expect(event.event_type).toBe('subagent.failed');
    expect(event.severity).toBe('critical');
    expect(event.source_authority).toBe('authoritative');
    expect(event.dedupe_key).toBe('agenthub:subagent.failed:child-7:claude:msg-9');
    expect(event.body).toContain('Tool execution failed');
  });

  test('health sources preserve canonical authority and freshness metadata', () => {
    const source = createHealthSource({
      key: 'mcp',
      label: 'MCP',
      status: 'stale',
      authority: 'inferred',
      freshness_ms: 600000,
      observed_at: '2026-04-10T17:10:00.000Z',
      status_reason: 'Using cached MCP configuration.',
    });

    expect(source).toMatchObject({
      key: 'mcp',
      status: 'stale',
      authority: 'inferred',
      freshness_ms: 600000,
      status_reason: 'Using cached MCP configuration.',
    });
  });

  test('dedupe keys ignore empty dedupe parts', () => {
    expect(
      buildOperationalDedupeKey('agenthub', 'subagent.completed', ['session-1', '', null, 'gpt'])
    ).toBe('agenthub:subagent.completed:session-1:gpt');
  });
});
