'use client';

/**
 * Cursor-style "Restart to update" pill.
 *
 * Shows only in the Electron desktop when an update finished downloading
 * (main process emits window-event {type:'update-downloaded'}); clicking
 * restarts the app and applies it in place. Dismissing hides it for the
 * session — the update still installs on next quit.
 */

import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { invokeDesktop, isElectronDesktop } from '@/lib/desktop/desktopBridge';

export default function UpdatePill() {
  const [update, setUpdate] = useState(null); // { version } | null
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isElectronDesktop()) return undefined;

    let cancelled = false;

    // The SPA can mount after the download finished — ask for current state.
    invokeDesktop('update_status').then((res) => {
      if (!cancelled && res?.downloaded) {
        setUpdate({ version: res.version || null });
      }
    });

    const unsub = window.devhubDesktop?.on?.('window-event', (payload) => {
      if (payload?.type === 'update-downloaded') {
        setUpdate({ version: payload.version || null });
        setDismissed(false);
      }
    });

    return () => {
      cancelled = true;
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  if (!update || dismissed) return null;

  const label = update.version
    ? `Reiniciar para actualizar a v${update.version}`
    : 'Reiniciar para actualizar';

  const handleRestart = async () => {
    if (installing) return;
    setInstalling(true);
    const res = await invokeDesktop('update_install');
    if (!res?.ok) setInstalling(false);
  };

  return (
    <div
      className="fixed top-2 right-36 z-[9999] flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/90 py-1 pl-3 pr-1 text-xs text-emerald-200 shadow-lg backdrop-blur"
      style={{ WebkitAppRegion: 'no-drag' }}
      role="status"
    >
      <button
        type="button"
        onClick={handleRestart}
        disabled={installing}
        className="flex items-center gap-1.5 font-medium hover:text-emerald-100 disabled:opacity-60"
        title="Se instala al reiniciar — tus datos se conservan"
      >
        <RefreshCw size={12} className={installing ? 'animate-spin' : ''} />
        {installing ? 'Reiniciando…' : label}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded-full p-1 text-emerald-400/70 hover:bg-emerald-900 hover:text-emerald-200"
        aria-label="Ocultar"
      >
        <X size={12} />
      </button>
    </div>
  );
}
