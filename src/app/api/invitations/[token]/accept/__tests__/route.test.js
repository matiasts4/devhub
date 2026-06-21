const { POST } = require('../route');
const { getSupabaseAdmin, isCloudAuthEnabled } = require('@/lib/invitations/supabaseAdmin');
const { getCurrentUser } = require('@/lib/auth/apiAuth');

jest.mock('@/lib/invitations/supabaseAdmin');
jest.mock('@/lib/auth/apiAuth');

function createAdminClient(overrides = {}) {
  const workspaceInvite = overrides.workspaceInvite || null;
  const projectInvite = overrides.projectInvite || null;
  const upsertError = overrides.upsertError || null;
  const updateError = overrides.updateError || null;
  const chains = {};

  function chainFor(table) {
    if (chains[table]) return chains[table];

    let data = null;
    if (table === 'workspace_invitations') data = workspaceInvite;
    if (table === 'project_invitations') data = projectInvite;

    chains[table] = {
      select: jest.fn(() => chains[table]),
      eq: jest.fn(() => chains[table]),
      maybeSingle: jest.fn(() => Promise.resolve({ data, error: null })),
      upsert: jest.fn(() => Promise.resolve({ error: upsertError })),
      insert: jest.fn(() => Promise.resolve({ error: null })),
      update: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: updateError })),
      })),
    };
    return chains[table];
  }

  return { from: jest.fn((table) => chainFor(table)) };
}

function mockRequest() {
  return { json: jest.fn(() => Promise.resolve({})) };
}

const params = Promise.resolve({ token: 'invite-token-1' });
const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

describe('POST /api/invitations/[token]/accept', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isCloudAuthEnabled.mockReturnValue(true);
  });

  test('returns 401 when not authenticated', async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await POST(mockRequest(), { params });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'No autenticado' });
  });

  test('returns 404 for unknown token', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'new@test.com' });
    const admin = createAdminClient({});
    getSupabaseAdmin.mockReturnValue(admin);
    const res = await POST(mockRequest(), { params });
    expect(res.status).toBe(404);
  });

  test('returns 410 for expired invitation', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'new@test.com' });
    const admin = createAdminClient({
      projectInvite: {
        project_id: 'project-uuid-1',
        email: 'new@test.com',
        role: 'member',
        status: 'pending',
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    });
    getSupabaseAdmin.mockReturnValue(admin);
    const res = await POST(mockRequest(), { params });
    expect(res.status).toBe(410);
  });

  test('accepts project invitation and updates status', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'new@test.com' });
    const admin = createAdminClient({
      projectInvite: {
        project_id: 'project-uuid-1',
        email: 'new@test.com',
        role: 'admin',
        status: 'pending',
        expires_at: future,
        invited_by: 'owner-uuid',
      },
    });
    getSupabaseAdmin.mockReturnValue(admin);

    const res = await POST(mockRequest(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.projectId).toBe('project-uuid-1');

    expect(admin.from).toHaveBeenCalledWith('project_members');
    const upsertCall = admin.from('project_members').upsert.mock.calls[0];
    expect(upsertCall[0]).toMatchObject({
      project_id: 'project-uuid-1',
      user_id: 'u1',
      role: 'admin',
      invited_by: 'owner-uuid',
    });
    expect(upsertCall[1]).toEqual({ onConflict: 'project_id,user_id' });

    expect(admin.from).toHaveBeenCalledWith('project_invitations');
    const updateCall = admin.from('project_invitations').update.mock.calls[0];
    expect(updateCall[0]).toMatchObject({ status: 'accepted' });
  });
});
