import { useState, useEffect, useCallback } from 'react';
import { Loader2, Trash2, Link2, Check } from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import { sileo } from 'sileo';
import useSupabaseRealtime from '@/hooks/useSupabaseRealtime';

const ROLE_OPTIONS = [
  { value: 'member', label: 'Miembro' },
  { value: 'admin', label: 'Admin' },
  { value: 'viewer', label: 'Viewer' },
];

function roleLabel(role) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
}

export default function EquipoSettings({ projectId }) {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [copiedToken, setCopiedToken] = useState(null);
  const [isCloud, setIsCloud] = useState(false);
  const db = createClient();

  const fetchMembers = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from('project_members')
        .select('role, invited_email, accepted_at, user_id, invited_by')
        .eq('project_id', projectId);

      if (error) {
        sileo.error({ title: 'Error al cargar miembros: ' + error.message });
      } else {
        setMembers(data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, db]);

  const fetchInvitations = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/invitations`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('fetch invitations failed:', err.error);
        return;
      }
      const data = await res.json();
      setInvitations(data.invitations || []);
      setIsCloud(true);
    } catch (err) {
      console.warn('invitations endpoint unavailable (local mode?):', err.message);
      setInvitations([]);
      setIsCloud(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      fetchMembers();
      fetchInvitations();
    }
  }, [projectId, fetchMembers, fetchInvitations]);

  useSupabaseRealtime({
    table: 'project_members',
    filter: projectId ? `project_id=eq.${projectId}` : undefined,
    onInsert: fetchMembers,
    onUpdate: fetchMembers,
    onDelete: fetchMembers,
    enabled: Boolean(projectId),
    channelName: `public:project_members:${projectId || 'none'}`,
  });

  async function handleInvite(e) {
    e.preventDefault();
    if (!email) return;

    setInviting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      sileo.success({ title: 'Invitación creada', description: data.message });
      setEmail('');
      setRole('member');
      fetchInvitations();
    } catch (err) {
      sileo.error({ title: err.message });
    } finally {
      setInviting(false);
    }
  }

  async function revokeInvitation(token) {
    try {
      const res = await fetch(`/api/projects/${projectId}/invitations`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sileo.success({ title: 'Invitación revocada' });
      fetchInvitations();
    } catch (err) {
      sileo.error({ title: err.message });
    }
  }

  function copyInviteUrl(invite) {
    const origin = window.location.origin;
    const url = `${origin}/invitations/${invite.token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(invite.token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }

  async function removeMember(member) {
    if (!confirm('¿Quitar miembro?')) return;

    let query = db.from('project_members').delete().eq('project_id', projectId);
    if (member.user_id) {
      query = query.eq('user_id', member.user_id);
    } else if (member.invited_email) {
      query = query.eq('invited_email', member.invited_email);
    } else {
      sileo.error({ title: 'No se puede identificar al miembro para eliminarlo' });
      return;
    }

    const { error } = await query;
    if (error) {
      sileo.error({ title: 'Error: ' + error.message });
    } else {
      sileo.success({ title: 'Miembro eliminado' });
      fetchMembers();
    }
  }

  return (
    <div className="px-5 py-4 space-y-4">
      {isCloud && (
        <form onSubmit={handleInvite} className="flex gap-2 items-center">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@ejemplo.com"
            className="flex-1 bg-transparent text-sm px-3 py-1.5 focus:outline-none focus:ring-1 transition-all rounded"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="bg-transparent text-sm px-2 py-1.5 focus:outline-none focus:ring-1 rounded"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value} style={{ background: 'var(--surface-sunken)' }}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={inviting || !email}
            className="px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1 transition-all"
            style={{
              background: 'var(--accent-primary)',
              color: 'var(--primary-foreground, #000)',
              opacity: inviting || !email ? 0.5 : 1,
            }}
          >
            {inviting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Invitar'}
          </button>
        </form>
      )}

      <div className="space-y-2 mt-4">
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto opacity-50" />
        ) : (
          <>
            {members.map((m) => {
              const key = `${m.project_id || projectId}-${m.user_id || m.invited_email || m.invited_by}`;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between p-2 rounded"
                  style={{ background: 'var(--surface-sunken)' }}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {m.invited_email || m.user_id} {m.accepted_at ? '' : '(Pendiente)'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Rol: {roleLabel(m.role)}
                    </span>
                  </div>
                  <button
                    onClick={() => removeMember(m)}
                    className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-neutral-800 text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}

            {invitations.length > 0 && (
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                  Invitaciones pendientes
                </p>
                {invitations.map((inv) => (
                  <div
                    key={inv.token}
                    className="flex items-center justify-between p-2 rounded"
                    style={{ background: 'var(--surface-sunken)' }}
                  >
                    <div className="flex flex-col">
                      <span
                        className="text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {inv.email}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Rol: {roleLabel(inv.role)} · Expira:{' '}
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyInviteUrl(inv)}
                        className="p-1.5 rounded opacity-70 hover:opacity-100 hover:bg-neutral-800 text-text-muted"
                        title="Copiar link de invitación"
                      >
                        {copiedToken === inv.token ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Link2 className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => revokeInvitation(inv.token)}
                        className="p-1.5 rounded opacity-60 hover:opacity-100 hover:bg-neutral-800 text-red-400"
                        title="Revocar invitación"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && members.length === 0 && invitations.length === 0 && (
              <p className="text-xs opacity-50">No hay miembros ni invitaciones aún.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
