import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';

export default function PresenceAvatars({ projectId }) {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!projectId || !user) return;
    
    const supabase = createClient();
    const room = supabase.channel(`presence:project:${projectId}`);

    room
      .on('presence', { event: 'sync' }, () => {
        const state = room.presenceState();
        // Convertir state de presence { uuid: [{ user_id, email, ... }] }
        const usersMap = new Map();
        for (const [key, presences] of Object.entries(state)) {
          presences.forEach(p => {
            if (p.user_id) {
              usersMap.set(p.user_id, p);
            }
          });
        }
        setOnlineUsers(Array.from(usersMap.values()));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await room.track({
            user_id: user.id,
            email: user.email,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(room);
    };
  }, [projectId, user]);

  if (onlineUsers.length === 0) return null;

  return (
    <div className="flex -space-x-2 mr-4" title="Usuarios activos en el proyecto">
      {onlineUsers.map(u => (
        <div key={u.user_id} className="w-8 h-8 rounded-full border-2 border-[#0d1117] flex items-center justify-center text-xs font-bold font-mono" style={{ background: "var(--accent-primary)", color: "#fff" }} title={u.email}>
          {u.email ? u.email.substring(0, 2).toUpperCase() : "U"}
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[#0d1117] rounded-full"></span>
        </div>
      ))}
    </div>
  );
}
