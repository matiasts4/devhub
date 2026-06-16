'use client';

import { Loader2, Mic, Square } from 'lucide-react';

/**
 * Push-to-talk mic control for Zed ambient overlay.
 */
export default function ZedVoiceButton({
  recording = false,
  enginePhase = 'idle',
  available = false,
  disabled = false,
  onToggle,
  className = '',
}) {
  const preparing = enginePhase === 'preparing' || enginePhase === 'loading_model';
  const listening = recording || enginePhase === 'listening';
  const Icon = listening ? Square : preparing ? Loader2 : Mic;
  const label = listening
    ? 'Detener grabación (Ctrl+Shift+M)'
    : preparing
      ? 'Preparando micrófono…'
      : 'Hablar con Zed (Ctrl+Shift+M)';

  return (
    <button
      type="button"
      data-testid="zed-voice-button"
      aria-label={label}
      aria-pressed={listening}
      disabled={disabled || !available || preparing}
      title={available ? label : 'Voz no disponible en este entorno'}
      onClick={onToggle}
      className={[
        'relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition',
        listening
          ? 'border-red-400/60 bg-red-500/20 text-red-300 shadow-[0_0_0_4px_rgba(248,113,113,0.25)]'
          : preparing
            ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
            : 'border-white/10 bg-white/5 text-[var(--accent-primary)] hover:bg-white/10',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      ].join(' ')}
    >
      {listening ? (
        <span
          className="absolute inset-0 rounded-full border border-red-400/50 animate-ping"
          aria-hidden="true"
        />
      ) : null}
      <Icon className={`relative h-4 w-4 ${preparing ? 'animate-spin' : ''}`} aria-hidden="true" />
    </button>
  );
}
