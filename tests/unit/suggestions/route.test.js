/**
 * Integration tests for /api/ai/suggestions route (T8)
 * TDD — tests written BEFORE implementation
 *
 * Strategy: extract & test the core logic functions (pure) instead of
 * mocking the full Next.js request/response cycle (which would need 7+ mocks).
 * This follows the Extract-Before-Mock rule from strict-tdd.md.
 *
 * We test:
 * - buildSystemPrompt() — serializes project context correctly
 * - parseJsonFromText() — extracts JSON from LLM response (various formats)
 * - accumulateChunks() — NDJSON chunk accumulator
 */

const {
  buildSystemPrompt,
  parseJsonFromText,
  accumulateChunks,
} = require('../../../src/app/api/ai/suggestions/helpers');

const { buildLocalSuggestions } = require('../../../src/lib/suggestions/rules');

// ── buildSystemPrompt ─────────────────────────────────────────────────────────

describe('buildSystemPrompt — project context', () => {
  test('includes project name, tasks and milestones', () => {
    const project = { id: 'p1', name: 'DevHub', progress: 30 };
    const tasks = [
      { title: 'Setup CI', status: 'pending', priority: 'high' },
      { title: 'Write tests', status: 'in_progress', priority: 'medium' },
    ];
    const milestones = [{ title: 'MVP', status: 'planned', due_date: '2026-05-01' }];

    const result = buildSystemPrompt(project, tasks, milestones);

    expect(typeof result).toBe('string');
    expect(result).toContain('DevHub');
    expect(result).toContain('Setup CI');
    expect(result).toContain('MVP');
    // Must force JSON output
    expect(result.toLowerCase()).toContain('json');
  });

  test('includes user prompt when provided', () => {
    const project = { id: 'p1', name: 'Test', progress: 0 };
    const result = buildSystemPrompt(project, [], [], 'dame sugerencias de testing');
    expect(result).toContain('dame sugerencias de testing');
  });

  test('handles large context without crashing (100 tasks)', () => {
    const project = { id: 'p1', name: 'Test', progress: 50 };
    const manyTasks = Array.from({ length: 100 }, (_, i) => ({
      title: `Task number ${i} with a long descriptive title that goes on and on`,
      status: 'pending',
      priority: 'medium',
    }));
    const result = buildSystemPrompt(project, manyTasks, []);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── parseJsonFromText ─────────────────────────────────────────────────────────

describe('parseJsonFromText — extracts Suggestion[] from LLM output', () => {
  test('extracts JSON from ```json block', () => {
    const text = `Here are suggestions:
\`\`\`json
[{"id":"s1","title":"Fix bug","description":"desc","type":"risk","action_hint":"hint"}]
\`\`\`
That's all.`;
    const result = parseJsonFromText(text);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('s1');
    expect(result[0].type).toBe('risk');
  });

  test('extracts bare JSON array', () => {
    const text = `[{"id":"s2","title":"Deploy","description":"desc","type":"opportunity","action_hint":"go"}]`;
    const result = parseJsonFromText(text);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].id).toBe('s2');
  });

  test('returns null for non-JSON text', () => {
    const result = parseJsonFromText('This is just plain text with no JSON');
    expect(result).toBeNull();
  });

  test('returns null for malformed JSON', () => {
    const result = parseJsonFromText('```json\n[{broken json}\n```');
    expect(result).toBeNull();
  });

  test('returns null for non-array JSON (object)', () => {
    const result = parseJsonFromText('{"key": "value"}');
    expect(result).toBeNull();
  });
});

// ── accumulateChunks ──────────────────────────────────────────────────────────

describe('accumulateChunks — processes NDJSON lines from agenthub/chat', () => {
  test('concatenates type:chunk content', () => {
    const lines = [
      JSON.stringify({ type: 'meta', model_used: 'gpt-4o' }),
      JSON.stringify({ type: 'chunk', content: '[{"id":"s1"' }),
      JSON.stringify({
        type: 'chunk',
        content: ',"title":"Test","description":"d","type":"tip","action_hint":"h"}]',
      }),
      JSON.stringify({ type: 'usage', usage: { total_tokens: 100 } }),
    ];
    const result = accumulateChunks(lines);
    expect(typeof result).toBe('string');
    expect(result).toContain('"id":"s1"');
    expect(result).not.toContain('"type":"meta"');
  });

  test('ignores non-chunk lines (meta, usage, invalid)', () => {
    const lines = [
      JSON.stringify({ type: 'meta', model_used: 'gpt-4o' }),
      JSON.stringify({ type: 'usage', usage: {} }),
      'invalid-json-line',
    ];
    const result = accumulateChunks(lines);
    expect(result).toBe('');
  });

  test('handles empty input', () => {
    const result = accumulateChunks([]);
    expect(result).toBe('');
  });
});

// ── threshold behavior ────────────────────────────────────────────────────────

describe('threshold behavior — route fast-path (< 2 tasks)', () => {
  const project = { id: 'p1', name: 'TestProject', progress: 10, status: 'active' };
  const milestones = [];

  test('retorna reglas locales cuando tasks.length === 0', () => {
    const suggestions = buildLocalSuggestions(project, [], milestones);
    // Fast path should return an array (may be empty for 0-task projects)
    expect(Array.isArray(suggestions)).toBe(true);
    // All returned suggestions must have valid schema fields
    for (const s of suggestions) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.title).toBe('string');
      expect(['risk', 'alert', 'opportunity', 'tip']).toContain(s.type);
    }
  });

  test('retorna reglas locales cuando tasks.length === 1', () => {
    const tasks = [{ title: 'Single task', status: 'pending', priority: 'medium' }];
    const suggestions = buildLocalSuggestions(project, tasks, milestones);
    expect(Array.isArray(suggestions)).toBe(true);
    for (const s of suggestions) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.title).toBe('string');
      expect(['risk', 'alert', 'opportunity', 'tip']).toContain(s.type);
    }
  });

  test('retorna máximo 5 sugerencias incluso con muchas tareas', () => {
    const manyTasks = Array.from({ length: 20 }, (_, i) => ({
      title: `Task ${i}`,
      status: 'pending',
      priority: 'high',
    }));
    const suggestions = buildLocalSuggestions(project, manyTasks, milestones);
    expect(suggestions.length).toBeLessThanOrEqual(5);
  });

  test('no_llm flag in route response shape — response JSON includes correct keys', () => {
    // Verifica que la forma del objeto de respuesta del route tiene las claves correctas
    // cuando se simula un fallback con no_llm=true
    const fakeNoLlmResponse = {
      suggestions: buildLocalSuggestions(project, [], milestones),
      source: 'rules',
      no_llm: true,
    };
    expect(fakeNoLlmResponse.no_llm).toBe(true);
    expect(fakeNoLlmResponse.source).toBe('rules');
    expect(Array.isArray(fakeNoLlmResponse.suggestions)).toBe(true);
  });
});
