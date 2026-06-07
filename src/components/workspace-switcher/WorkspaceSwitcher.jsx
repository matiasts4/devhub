/* eslint-disable no-unused-vars */
'use client';

import { useAuth } from '@/lib/auth/AuthContext';
import { selectStyle } from '@/chrome/morphology';
import { Layers } from 'lucide-react';

export default function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, loading } = useAuth();

  // If not logged in (local-dev mode), show local-ws singleton
  const activeWorkspaces =
    workspaces.length > 0 ? workspaces : [{ id: 'local-ws', name: 'Espacio Local' }];

  const currentWorkspaceId = activeWorkspaceId || 'local-ws';

  const handleChange = (e) => {
    setActiveWorkspaceId(e.target.value);
  };

  return (
    <div className="flex items-center gap-2 select-none" style={{ WebkitAppRegion: 'no-drag' }}>
      <Layers className="w-3.5 h-3.5 text-accent-primary shrink-0" strokeWidth={1.7} />
      <div className="relative shrink-0">
        <select
          value={currentWorkspaceId}
          onChange={handleChange}
          disabled={loading || activeWorkspaces.length <= 1}
          style={{
            ...selectStyle(),
            paddingTop: '0.35rem',
            paddingBottom: '0.35rem',
            height: 'auto',
            fontSize: '11px',
            lineHeight: '1.2',
            backgroundPosition:
              'calc(100% - 0.75rem) calc(50% - 1px), calc(100% - 0.45rem) calc(50% - 1px)',
            paddingRight: '1.75rem',
            borderWidth: '1px',
            borderColor: 'var(--border-subtle)',
            borderRadius: 'var(--chrome-radius-control, 4px)',
          }}
        >
          {activeWorkspaces.map((ws) => (
            <option key={ws.id} value={ws.id} style={{ background: '#0d0d0d', color: '#e5e7eb' }}>
              {ws.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
