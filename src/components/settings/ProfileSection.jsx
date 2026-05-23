'use client';

import { useState, useEffect } from 'react';
import { User, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function ProfileSection({ db }) {
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    db.from('profiles')
      .select('*')
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setFullName(data?.full_name || 'Usuario Local');
        }
      });
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    const { error } = await db.from('profiles').upsert({ id: 'local-user', full_name: fullName });
    setSavingProfile(false);
    if (error) {
      toast.error('Error al guardar perfil');
      return;
    }
    toast.success('Perfil actualizado');
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: '#D2A8FF18', border: '1px solid #D2A8FF30' }}
          >
            <User className="w-4 h-4" style={{ color: '#D2A8FF' }} />
          </div>
          <div>
            <h3
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Perfil de Usuario
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Tu nombre visible en el sistema
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {profile && (
            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: 'var(--surface-muted)' }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-mono text-sm font-bold"
                style={{ background: 'var(--accent-primary)', color: 'white' }}
              >
                {(fullName || profile.email || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {fullName || 'Sin nombre'}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  {profile.email}
                </p>
              </div>
            </div>
          )}

          <div>
            <label
              className="block text-xs mb-1.5 font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Nombre completo
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors cursor-pointer"
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="flex items-center gap-2 font-medium px-5 py-2.5 rounded-lg text-xs transition-all disabled:opacity-50"
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-secondary)',
            }}
          >
            {savingProfile ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar perfil
          </button>
        </div>
      </div>
    </div>
  );
}
