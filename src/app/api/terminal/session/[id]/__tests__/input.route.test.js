/** @jest-environment node */

jest.mock('@/lib/terminal/ttyServer', () => ({
  pushSessionInput: jest.fn(() => false),
}));

jest.mock('@/lib/terminal/sidecarSessionApi', () => ({
  trySidecarInput: jest.fn(async () => ({ session_id: 'p1', sent: true, source: 'sidecar' })),
}));

const { pushSessionInput } = require('@/lib/terminal/ttyServer');
const { trySidecarInput } = require('@/lib/terminal/sidecarSessionApi');
const { PUT } = require('../input/route');

describe('PUT /api/terminal/session/[id]/input', () => {
  beforeEach(() => {
    pushSessionInput.mockReset().mockReturnValue(false);
    trySidecarInput.mockClear();
  });

  test('falls back to sidecar when ttyServer misses', async () => {
    const req = new Request('http://localhost/api/terminal/session/p1/input', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'ls\n' }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('sidecar');
    expect(trySidecarInput).toHaveBeenCalledWith('p1', 'ls\n');
  });

  test('uses tty when available', async () => {
    pushSessionInput.mockReturnValue(true);
    const req = new Request('http://localhost/api/terminal/session/p1/input', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'pwd\n' }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: 'p1' }) });
    const body = await res.json();
    expect(body.source).toBe('tty');
    expect(trySidecarInput).not.toHaveBeenCalled();
  });
});
