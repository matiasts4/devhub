/**
 * Unit tests for SwarmQueue
 *
 * Tests run in isolation — processManager and localDb are mocked
 * so the module can be required without a DB or child process.
 */

// Mock heavy dependencies before requiring queue.js
jest.mock('@/lib/swarm/processManager', () => ({
  getStatus: jest.fn().mockResolvedValue({ running: true, healthy: true }),
}));

jest.mock('@/lib/db/localDb.js', () => ({
  getSwarmConfig: jest.fn().mockReturnValue({ max_concurrent: '5' }),
  getActiveAgentCount: jest.fn().mockReturnValue(0),
}));

// SwarmQueue is a class — we need a fresh instance per test.
// Require the module AFTER mocks are set up.
// But queue.js exports a singleton instance, not the class.
// We need to test the class directly. Two options:
//   A) Require the singleton and manipulate it directly
//   B) Extract just what we need to test

// Since queue.js exports a singleton, we'll create a fresh class by
// accessing the prototype, or we re-require via jest.isolateModules.

describe('SwarmQueue.remove()', () => {
  let queue;

  beforeEach(() => {
    // Create a fresh SwarmQueue instance for each test.
    // We use jest.isolateModules to get the class, bypassing the singleton.
    jest.isolateModules(() => {
      const instance = require('../queue.js');
      // Clear the queue array directly (it's a singleton in isolation context)
      instance.queue = [];
      instance.started = false;
      if (instance.pollingInterval) {
        clearInterval(instance.pollingInterval);
        instance.pollingInterval = null;
      }
      queue = instance;
    });
  });

  afterEach(() => {
    // Stop polling if started to avoid timer leaks
    if (queue && queue.pollingInterval) {
      clearInterval(queue.pollingInterval);
      queue.pollingInterval = null;
      queue.started = false;
    }
  });

  // --- Task 1.1 Scenario: Cancel existing queue item ---

  test('remove() returns true and removes item when id exists', () => {
    // Arrange: manually push a fake queued item
    const rejectFn = jest.fn();
    const resolveFn = jest.fn();
    queue.queue.push({
      id: 'abc',
      body: { agent: 'test-agent' },
      enqueuedAt: Date.now(),
      resolve: resolveFn,
      reject: rejectFn,
    });
    expect(queue.queue).toHaveLength(1);

    // Act
    const result = queue.remove('abc');

    // Assert
    expect(result).toBe(true);
    expect(queue.queue).toHaveLength(0);
    expect(rejectFn).toHaveBeenCalledTimes(1);
  });

  test('remove() calls item.reject with an Error with .cancelled = true', () => {
    // Arrange
    const rejectFn = jest.fn();
    queue.queue.push({
      id: 'abc',
      body: {},
      enqueuedAt: Date.now(),
      resolve: jest.fn(),
      reject: rejectFn,
    });

    // Act
    queue.remove('abc');

    // Assert: the Error passed to reject has .cancelled = true
    const calledWith = rejectFn.mock.calls[0][0];
    expect(calledWith).toBeInstanceOf(Error);
    expect(calledWith.cancelled).toBe(true);
    expect(calledWith.message).toBe('Cancelled by user');
  });

  // --- Task 1.1 Scenario: Cancel non-existent item ---

  test('remove() returns false and leaves queue unchanged when id does not exist', () => {
    // Arrange: queue has one item with id 'foo', removing 'xyz'
    const rejectFn = jest.fn();
    queue.queue.push({
      id: 'foo',
      body: {},
      enqueuedAt: Date.now(),
      resolve: jest.fn(),
      reject: rejectFn,
    });

    // Act
    const result = queue.remove('xyz');

    // Assert
    expect(result).toBe(false);
    expect(queue.queue).toHaveLength(1);
    expect(rejectFn).not.toHaveBeenCalled();
  });

  // --- Triangulation: multiple items, remove middle one ---

  test('remove() removes only the targeted item when multiple items are queued', () => {
    // Arrange: 3 items
    const ids = ['item-1', 'item-2', 'item-3'];
    const rejects = ids.map(() => jest.fn());
    ids.forEach((id, i) => {
      queue.queue.push({
        id,
        body: {},
        enqueuedAt: Date.now(),
        resolve: jest.fn(),
        reject: rejects[i],
      });
    });

    // Act: remove the middle item
    const result = queue.remove('item-2');

    // Assert
    expect(result).toBe(true);
    expect(queue.queue).toHaveLength(2);
    expect(queue.queue.map((i) => i.id)).toEqual(['item-1', 'item-3']);
    expect(rejects[1]).toHaveBeenCalledTimes(1); // item-2's reject called
    expect(rejects[0]).not.toHaveBeenCalled(); // item-1 untouched
    expect(rejects[2]).not.toHaveBeenCalled(); // item-3 untouched
  });

  test('getStatus() keeps FIFO order with 1-based positions for queued work', () => {
    queue.queue.push(
      {
        id: 'item-1',
        body: { agent: 'worker-1' },
        enqueuedAt: 1000,
        resolve: jest.fn(),
        reject: jest.fn(),
      },
      {
        id: 'item-2',
        body: { agent: 'worker-2' },
        enqueuedAt: 2000,
        resolve: jest.fn(),
        reject: jest.fn(),
      },
      {
        id: 'item-3',
        body: { agent: 'worker-3' },
        enqueuedAt: 3000,
        resolve: jest.fn(),
        reject: jest.fn(),
      }
    );

    const status = queue.getStatus();

    expect(status.length).toBe(3);
    expect(status.items).toEqual([
      expect.objectContaining({ id: 'item-1', position: 1, enqueuedAt: 1000 }),
      expect.objectContaining({ id: 'item-2', position: 2, enqueuedAt: 2000 }),
      expect.objectContaining({ id: 'item-3', position: 3, enqueuedAt: 3000 }),
    ]);
  });

  test('getStatus() estimates longer wait for later queue positions', () => {
    queue.queue.push(
      {
        id: 'item-1',
        body: {},
        enqueuedAt: 1000,
        resolve: jest.fn(),
        reject: jest.fn(),
      },
      {
        id: 'item-2',
        body: {},
        enqueuedAt: 2000,
        resolve: jest.fn(),
        reject: jest.fn(),
      }
    );

    const status = queue.getStatus();

    expect(status.items[0].estimatedWaitMs).toBe(0);
    expect(status.items[1].estimatedWaitMs).toBe(30000);
    expect(status.atLimit).toBe(false);
  });
});
