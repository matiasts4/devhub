const { POST } = require('../route');
const { getSupabaseAdmin, isCloudAuthEnabled } = require('@/lib/invitations/supabaseAdmin');
const { getCurrentUser } = require('@/lib/auth/apiAuth');

jest.mock('@/lib/invitations/supabaseAdmin');
jest.mock('@/lib/auth/apiAuth');

function createAdminClient(overrides = {}) {
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    maybeSingle: jest.fn(() =>
      Promise.resolve({ data: overrides.membership || null, error: null })
    ),
    upsert: jest.fn(() => Promise.resolve({ error: overrides.upsertError || null })),
    insert: jest.fn(() => Promise.resolve({ error: overrides.insertError || null })),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    order: jest.fn(() => chain),
  };
  return { from: jest.fn(() => chain) };
}

function mockRequest({ body = {}, origin = 'https://test.devhub.local' }) {
  return {
    json: jest.fn(() => Promise.resolve(body)),
    nextUrl: { origin },
  };
}

const params = Promise.resolve({ id: 'project-uuid-1' });

describe('POST /api/projects/[id]/invite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isCloudAuthEnabled.mockReturnValue(true);
  });

  test('returns 401 when not authenticated', async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await POST(mockRequest({ body: {} }), { params });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'No autenticado' });
  });

  test('returns 400 in local mode', async () => {
    isCloudAuthEnabled.mockReturnValue(false);
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'owner@test.com' });
    const res = await POST(mockRequest({ body: {} }), { params });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invitaciones solo disponibles en modo cloud' });
  });

  test('returns 403 when user is not owner/admin', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'member@test.com' });
    const admin = createAdminClient({ membership: { role: 'member' } });
    getSupabaseAdmin.mockReturnValue(admin);
    const res = await POST(mockRequest({ body: { email: 'new@test.com', role: 'member' } }), {
      params,
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'No tienes permiso para invitar a este proyecto' });
  });

  test('creates invitation and returns token when owner invites', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'owner@test.com' });
    const admin = createAdminClient({ membership: { role: 'owner' } });
    getSupabaseAdmin.mockReturnValue(admin);

    const res = await POST(mockRequest({ body: { email: 'New@Test.COM ', role: 'admin' } }), {
      params,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.inviteUrl).toMatch(/^https:\/\/test\.devhub\.local\/invitations\//);
    expect(body.token).toBeTruthy();
    expect(body.message).toMatch(/new@test\.com/);

    const upsertCall = admin.from().upsert.mock.calls[0];
    expect(upsertCall[0]).toMatchObject({
      project_id: 'project-uuid-1',
      email: 'new@test.com',
      role: 'admin',
      status: 'pending',
      invited_by: 'u1',
    });
  });

  test('falls back to member for unknown roles', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'owner@test.com' });
    const admin = createAdminClient({ membership: { role: 'admin' } });
    getSupabaseAdmin.mockReturnValue(admin);

    const res = await POST(mockRequest({ body: { email: 'x@test.com', role: 'superuser' } }), {
      params,
    });
    expect(res.status).toBe(200);
    const upsertCall = admin.from().upsert.mock.calls[0];
    expect(upsertCall[0].role).toBe('member');
  });
});
