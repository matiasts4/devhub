'use client';

import { useEffect } from 'react';

const INIT_ENDPOINT = '/api/realtime';
const EVENT_NAME = 'devhub:fs-change';

function dispatchRealtimeEvent(payload) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
}

export default function RealtimeBridge() {
  useEffect(() => {
    let socket = null;
    let reconnectTimer = null;
    let isUnmounted = false;

    const cleanup = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
    };

    const connect = async () => {
      try {
        const response = await fetch(INIT_ENDPOINT, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data?.status?.wsUrl) {
          throw new Error(data?.error || 'Realtime init failed');
        }

        socket = new WebSocket(data.status.wsUrl);

        socket.onopen = () => {
          console.log('[Reactivity-WS] Frontend connected to realtime WS');
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload?.type === 'fs:change') {
              dispatchRealtimeEvent(payload);
            }
            console.log('[Reactivity-WS] Frontend event:', payload);
          } catch (error) {
            console.error('[Reactivity-WS] Invalid WS payload', error);
          }
        };

        socket.onerror = (error) => {
          console.error('[Reactivity-WS] WebSocket error', error);
        };

        socket.onclose = () => {
          if (isUnmounted) {
            return;
          }
          reconnectTimer = setTimeout(connect, 1500);
        };
      } catch (error) {
        console.error('[Reactivity-WS] Init failed', error);
        if (!isUnmounted) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      cleanup();
    };
  }, []);

  return null;
}
