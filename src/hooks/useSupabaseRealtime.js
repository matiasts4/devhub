'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/db/localClient';

// Secuencia global para garantizar topics de canal únicos por suscripción.
// supabase-js >= 2.86 deduplica canales por topic: si otro componente (o un
// remount de StrictMode / una transición de AnimatePresence) ya suscribió el
// mismo topic, `.channel(name)` devuelve ESE canal y `.on('postgres_changes')`
// lanza "cannot add postgres_changes callbacks after subscribe()".
let channelSeq = 0;

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

    const base = channelName || `realtime:${table}:${filter || 'all'}`;
    const name = `${base}#${++channelSeq}`;
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
      // removeChannel es async; evita unhandled rejections al desmontar.
      try {
        const result = dbRef.current.removeChannel(channel);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch {
        // canal ya eliminado
      }
    };
  }, [table, filter, enabled, channelName]);
}
