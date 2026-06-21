'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/db/localClient';

/**
 * Hook genérico para suscribirse a cambios de Postgres vía Supabase Realtime.
 *
 * En modo local el realtime es un stub, por lo que el hook no hace nada dañino
 * y la UI sigue funcionando con polling/explicit fetch.
 *
 * @param {Object} options
 * @param {string} options.table
 * @param {string} [options.filter]  Filtro de Supabase Realtime, ej: `project_id=eq.${id}`
 * @param {function} [options.onInsert]
 * @param {function} [options.onUpdate]
 * @param {function} [options.onDelete]
 * @param {boolean} [options.enabled=true]
 * @param {string} [options.channelName]
 */
export default function useSupabaseRealtime({
  table,
  filter,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
  channelName,
}) {
  const dbRef = useRef(null);
  if (!dbRef.current) {
    dbRef.current = createClient();
  }

  const callbacksRef = useRef({ onInsert, onUpdate, onDelete });
  callbacksRef.current = { onInsert, onUpdate, onDelete };

  useEffect(() => {
    if (!enabled || !table) return;

    const name = channelName || `realtime:${table}:${filter || 'all'}`;
    const channel = dbRef.current
      .channel(name)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          const { eventType } = payload;
          if (eventType === 'INSERT') {
            callbacksRef.current.onInsert?.(payload.new, payload);
          } else if (eventType === 'UPDATE') {
            callbacksRef.current.onUpdate?.(payload.new, payload.old, payload);
          } else if (eventType === 'DELETE') {
            callbacksRef.current.onDelete?.(payload.old, payload);
          }
        }
      )
      .subscribe();

    return () => {
      dbRef.current.removeChannel(channel);
    };
  }, [table, filter, enabled, channelName]);
}
