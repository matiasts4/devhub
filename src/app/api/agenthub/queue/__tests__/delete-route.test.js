/**
 * Unit tests for DELETE /api/agenthub/queue/[itemId]
 *
 * Tests the handler logic in isolation by mocking swarmQueue
 * and NextResponse.
 */

// Mock swarmQueue singleton
jest.mock('@/lib/swarm/queue', () => ({
  remove: jest.fn(),
}));

// Mock next/server
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status || 200 })),
  },
}));

const swarmQueue = require('@/lib/swarm/queue');
const { NextResponse } = require('next/server');
const handler = require('../[itemId]/route.js');

describe('DELETE /api/agenthub/queue/[itemId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-assign mock return value to fresh jest.fn() after clearAllMocks
    NextResponse.json.mockImplementation((body, init) => ({ body, status: init?.status || 200 }));
  });

  // --- Scenario: Successful cancellation ---

  test('returns { success: true, removed: true } with HTTP 200 when item exists', async () => {
    swarmQueue.remove.mockReturnValue(true);

    const req = {};
    const ctx = { params: { itemId: 'abc' } };

    const response = await handler.DELETE(req, ctx);

    expect(swarmQueue.remove).toHaveBeenCalledWith('abc');
    expect(NextResponse.json).toHaveBeenCalledWith({ success: true, removed: true });
    expect(response.body.success).toBe(true);
    expect(response.body.removed).toBe(true);
  });

  // --- Scenario: Item not found ---

  test('returns { success: true, removed: false } with HTTP 200 when item does not exist', async () => {
    swarmQueue.remove.mockReturnValue(false);

    const req = {};
    const ctx = { params: { itemId: 'xyz' } };

    const response = await handler.DELETE(req, ctx);

    expect(swarmQueue.remove).toHaveBeenCalledWith('xyz');
    expect(response.body.success).toBe(true);
    expect(response.body.removed).toBe(false);
  });

  // --- Triangulation: missing itemId returns 400 ---

  test('returns 400 error when itemId is not provided', async () => {
    const req = {};
    const ctx = { params: {} };

    const response = await handler.DELETE(req, ctx);

    expect(swarmQueue.remove).not.toHaveBeenCalled();
    expect(NextResponse.json).toHaveBeenCalledWith({ error: 'itemId required' }, { status: 400 });
    expect(response.status).toBe(400);
  });
});
