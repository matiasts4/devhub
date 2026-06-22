/**
 * @jest-environment jsdom
 */

import {
  saveZedMemory,
  searchZedMemories,
  saveZedSessionSummary,
  extractZedMemoryEntities,
} from '../zedEngram';

describe('zedEngram', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, content: JSON.stringify([{ id: 1, title: 'Memory' }]) }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('saveZedMemory proxies to Engram', async () => {
    const result = await saveZedMemory({ title: 'Test', content: 'Hello', project: 'Zed' });
    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/mcp/engram',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('mem_save'),
      })
    );
  });

  test('saveZedMemory redacts API keys', async () => {
    await saveZedMemory({ title: 'Secret', content: 'key sk-abc123secret' });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.args.content).toContain('[REDACTED]');
    expect(body.args.content).not.toContain('sk-abc123secret');
  });

  test('searchZedMemories returns parsed memories', async () => {
    const result = await searchZedMemories({ query: 'Zed plan', project: 'Zed' });
    expect(result.success).toBe(true);
    expect(result.memories).toHaveLength(1);
  });

  test('searchZedMemories returns empty on error', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'down' }) });
    const result = await searchZedMemories({ query: 'x' });
    expect(result.success).toBe(false);
    expect(result.memories).toEqual([]);
  });

  test('saveZedSessionSummary proxies to Engram', async () => {
    const result = await saveZedSessionSummary({ content: 'summary', session_id: 's1' });
    expect(result.success).toBe(true);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.toolName).toBe('mem_session_summary');
  });

  test('extractZedMemoryEntities finds projects, tasks and tools', () => {
    const entities = extractZedMemoryEntities(
      'En el proyecto Zed, crear tarea #42 con open_terminal'
    );
    expect(entities.projects).toContain('Zed');
    expect(entities.tasks).toContain('42');
    expect(entities.tools).toContain('open_terminal');
  });
});
