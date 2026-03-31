import React, { useState, useEffect } from 'react';
import { Users, Mail, Loader2, Trash2, userPlus } from 'lucide-react';
import { createClient } from '@/lib/db/localSupabase';
import { toast } from 'sonner';

export default function EquipoSettings({ projectId }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('worker');
  const supabase = createClient();

  useEffect(() => {
    if (projectId) fetchMembers();
  }, [projectId]);

  async function fetchMembers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('project_members')
      .select(`id, role, invited_email, accepted_at, user_id, auth_users:user_id (email)`)
      .eq('project_id', projectId);
    
    if (error) {
      toast.error("Error al cargar miembros: " + error.message);
    } else {
      setMembers(data || []);
    }
    setLoading(false);
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!email) return;
    
    setInviting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      toast.success("Invitación creada. Link: " + data.inviteUrl);
      setEmail('');
      fetchMembers();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setInviting(false);
    }
  }
  
  async function removeMember(id) {
    if (!confirm('¿Quitar miembro?')) return;
    
    const { error } = await supabase.from('project_members').delete().eq('id', id);
    if (error) {
      toast.error("Error: " + error.message);
    } else {
      toast.success("Miembro eliminado");
      fetchMembers();
    }
  }

  return (
    <div className="px-5 py-4 space-y-4">
      <form onSubmit={handleInvite} className="flex gap-2 items-center">
        <input 
          type="email" 
          value={email} 
          onChange={e => setEmail(e.target.value)} 
          placeholder="email@ejemplo.com" 
          className="flex-1 bg-transparent text-sm px-3 py-1.5 focus:outline-none focus:ring-1 transition-all rounded"
          style={{ border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
        />
        <select 
          value={role} 
          onChange={e => setRole(e.target.value)}
          className="bg-transparent text-sm px-2 py-1.5 focus:outline-none focus:ring-1 rounded"
          style={{ border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
        >
          <option value="worker" style={{background: 'var(--surface-sunken)'}}>Worker</option>
          <option value="viewer" style={{background: 'var(--surface-sunken)'}}>Viewer</option>
          <option value="admin" style={{background: 'var(--surface-sunken)'}}>Admin</option>
        </select>
        <button 
          type="submit" 
          disabled={inviting || !email}
          className="px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1 transition-all"
          style={{ background: "var(--accent-primary)", color: "#fff", opacity: (inviting || !email) ? 0.5 : 1 }}
        >
          {inviting ? <Loader2 className="w-3 h-3 animate-spin"/> : "Invitar"}
        </button>
      </form>

      <div className="space-y-2 mt-4">
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto opacity-50" /> : 
          members.map(m => (
            <div key={m.id} className="flex items-center justify-between p-2 rounded" style={{ background: "var(--surface-sunken)" }}>
              <div className="flex flex-col">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {m.auth_users?.email || m.invited_email} {m.accepted_at ? "" : "(Pendiente)"}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Rol: {m.role}</span>
              </div>
              <button onClick={() => removeMember(m.id)} className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-neutral-800 text-red-400">
                <Trash2 className="w-4 h-4"/>
              </button>
            </div>
          ))
        }
        {!loading && members.length === 0 && <p className="text-xs opacity-50">No hay miembros aún.</p>}
      </div>
    </div>
  );
}
