const { GET, DELETE } = require('../route');
const { getSupabaseAdmin, isCloudAuthEnabled } = require('@/lib/invitations/supabaseAdmin');
const { getCurrentUser } = require('@/lib/auth/apiAuth');

jest.mock('@/lib/invitations/supabaseAdmin');
jest.mock('@/lib/auth/apiAuth');

function createAdminClient(overrides = {}) {
  const membership = overrides.membership || null;
  const invitations = overrides.invitations || [];
  const invite = overrides.invite || null;
  const updateError = overrides.updateError || null;

  function chainFor(table) {
    let orderPromise;
    if (table === 'project_invitations') {
      orderPromise = Promise.resolve({ data: invitations, error: null });
    } else {
      orderPromise = Promise.resolve({ data: [], error: null });
    }

    const maybeSinglePromise = Promise.resolve({
      data: table === 'project_invitations' ? invite : membership,
      error: null,
    });

    return {
      select: jest.fn(() => chainFor(table)),
      eq: jest.fn(() => chainFor(table)),
      order: jest.fn(() => orderPromise),
      maybeSingle: jest.fn(() => maybeSinglePromise),
      update: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: updateError })),
      })),
    };
  }

  return { from: jest.fn((table) => chainFor(table)) };
}

function mockRequest({ body = {} }) {
  return {
    json: jest.fn(() => Promise.resolve(body)),
  };
}

const params = Promise.resolve({ id: 'project-uuid-1' });

describe('GET /api/projects/[id]/invitations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isCloudAuthEnabled.mockReturnValue(true);
  });

  test('returns 401 when not authenticated', async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET({}, { params });
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-manager', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'viewer@test.com' });
    const admin = createAdminClient({ membership: { role: 'viewer' } });
    getSupabaseAdmin.mockReturnValue(admin);
    const res = await GET({}, { params });
    expect(res.status).toBe(403);
  });

  test('returns pending invitations for owner/admin', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'owner@test.com' });
    const invitations = [
      { token: 'tok-1', email: 'a@test.com', role: 'member', expires_at: new Date().toISOString() },
    ];
    const admin = createAdminClient({ membership: { role: 'owner' }, invitations });
    getSupabaseAdmin.mockReturnValue(admin);
    const res = await GET({}, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitations).toEqual(invitations);
  });
});

describe('DELETE /api/projects/[id]/invitations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isCloudAuthEnabled.mockReturnValue(true);
  });

  test('revokes invitation when manager', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'admin@test.com' });
    const admin = createAdminClient({
      membership: { role: 'admin' },
      invite: { token: 'tok-1', project_id: 'project-uuid-1' },
    });
    getSupabaseAdmin.mockReturnValue(admin);

    const res = await DELETE(mockRequest({ body: { token: 'tok-1' } }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revoked).toBe('tok-1');
  });

  test('returns 404 for unknown token', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'owner@test.com' });
    const admin = createAdminClient({ membership: { role: 'owner' }, invite: null });
    getSupabaseAdmin.mockReturnValue(admin);

    const res = await DELETE(mockRequest({ body: { token: 'missing' } }), { params });
    expect(res.status).toBe(404);
  });
});
