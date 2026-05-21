const { createTestDb } = require(process.cwd() + '/lib/test-schema.js');

let mockDb;
const mockCreateCompletion = jest.fn();
const mockReadFile = jest.fn();
const mockGetCopilotToken = jest.fn();

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreateCompletion,
      },
    },
  }))
);

jest.mock('fs/promises', () => ({
  readFile: (...args) => mockReadFile(...args),
}));

jest.mock('@/lib/copilot-token', () => ({
  getCopilotToken: (...args) => mockGetCopilotToken(...args),
}));

jest.mock('@/lib/db/localDb', () => ({
  getDb: jest.fn(() => mockDb),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status || 200 })),
  },
}));

const { NextResponse } = require('next/server');
const { POST } = require('../route.js');

function seedSessionWithMessages(db, count = 6) {
  db.prepare(
    `INSERT INTO agent_hub_sessions (id, project_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    'session-1',
    'project-1',
    'Sesión de prueba',
    '2026-04-10T10:00:00.000Z',
    '2026-04-10T10:00:00.000Z'
  );

  const insertMessage = db.prepare(
    `INSERT INTO agent_hub_messages (id, session_id, role, content, meta, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (let index = 0; index < count; index += 1) {
    insertMessage.run(
      `message-${index + 1}`,
      'session-1',
      index % 2 === 0 ? 'user' : 'assistant',
      `Mensaje ${index + 1} con contexto técnico sobre archivos, errores y decisiones ${'x'.repeat(48)}`,
      null,
      'web',
      `2026-04-10T10:00:0${index}.000Z`
    );
  }
}

describe('POST /api/agenthub/compress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createTestDb();
    NextResponse.json.mockImplementation((body, init) => ({ body, status: init?.status || 200 }));
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        priorityOrder: ['copilot'],
        providers: { copilot: { COPILOT_OAUTH_TOKEN: 'oauth-token' } },
      })
    );
    mockGetCopilotToken.mockResolvedValue('copilot-access-token');
    mockCreateCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content:
              'Resumí el historial: se revisaron rutas API, se preservó el contexto reciente y quedaron definidos los archivos relevantes.',
          },
        },
      ],
    });
  });

  test('compresses old messages, preserves recent messages, and returns actionable stats', async () => {
    seedSessionWithMessages(mockDb, 6);

    const response = await POST({
      json: async () => ({ session_id: 'session-1', keep_last_n: 2 }),
    });

    expect(response.status).toBe(200);
    expect(response.body.compressed).toBe(true);
    expect(response.body.messages_before).toBe(6);
    expect(response.body.messages_after).toBe(3);
    expect(response.body.messages_compressed).toBe(4);
    expect(response.body.keep_last_n).toBe(2);
    expect(response.body.tokens_saved).toBeGreaterThan(0);
    expect(response.body.token_reduction_ratio).toBeGreaterThan(0);
    expect(response.body.message_reduction_ratio).toBe(0.5);

    const remainingMessages = mockDb
      .prepare(
        `SELECT id, content, source, meta
         FROM agent_hub_messages
         WHERE session_id = ?
         ORDER BY created_at ASC`
      )
      .all('session-1');

    expect(remainingMessages).toHaveLength(3);
    expect(remainingMessages.map((message) => message.id)).toEqual([
      response.body.summary_message_id,
      'message-5',
      'message-6',
    ]);

    expect(remainingMessages[0].source).toBe('compress');
    expect(remainingMessages[0].content).toContain('[Resumen de historial comprimido]');

    const summaryMeta = JSON.parse(remainingMessages[0].meta);
    expect(summaryMeta).toMatchObject({
      compressed: true,
      compression_type: 'history_summary',
      messages_compressed: 4,
      keep_last_n: 2,
      summary_source: '/api/agenthub/compress',
      model_used: 'gpt-4o-mini',
    });
  });

  test('returns a non-destructive no-op response when there is not enough history yet', async () => {
    seedSessionWithMessages(mockDb, 4);

    const response = await POST({
      json: async () => ({ session_id: 'session-1', keep_last_n: 3 }),
    });

    expect(response.status).toBe(200);
    expect(response.body.compressed).toBe(false);
    expect(response.body.keep_last_n).toBe(3);
    expect(response.body.messages_before).toBe(4);
    expect(response.body.messages_after).toBe(4);
    expect(response.body.tokens_saved).toBe(0);
    expect(response.body.reason).toMatch(/No hay suficientes mensajes/i);
    expect(mockCreateCompletion).not.toHaveBeenCalled();

    const count = mockDb
      .prepare('SELECT COUNT(*) AS total FROM agent_hub_messages WHERE session_id = ?')
      .get('session-1');
    expect(count.total).toBe(4);
  });

  test('rolls back the transaction when summary persistence fails', async () => {
    seedSessionWithMessages(mockDb, 6);

    const originalPrepare = mockDb.prepare.bind(mockDb);
    mockDb.prepare = jest.fn((sql) => {
      if (sql.includes('INSERT INTO agent_hub_messages') && sql.includes("'compress'")) {
        return {
          run: () => {
            throw new Error('summary insert failed');
          },
        };
      }

      return originalPrepare(sql);
    });

    const response = await POST({
      json: async () => ({ session_id: 'session-1', keep_last_n: 2 }),
    });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('summary insert failed');

    const persistedMessages = originalPrepare(
      `SELECT id, source FROM agent_hub_messages WHERE session_id = ? ORDER BY created_at ASC`
    ).all('session-1');

    expect(persistedMessages).toHaveLength(6);
    expect(persistedMessages.every((message) => message.source === 'web')).toBe(true);
  });
});
