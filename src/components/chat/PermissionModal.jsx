import { ShieldCheck, Check, X, Clock, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

export default function PermissionModal({ isOpen, onClose, onApprove, onReject, permission }) {
  const [timeLeft, setTimeLeft] = useState(permission?.timeout || 60);
  const [decision, setDecision] = useState(null); // 'approved' | 'rejected' | null

  const timeout = permission?.timeout || 60;

  // Countdown timer
  useEffect(() => {
    if (!isOpen || decision) return;
    setTimeLeft(timeout);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, timeout, decision]);

  // Auto-reject on timeout
  useEffect(() => {
    if (timeLeft === 0 && !decision && isOpen) {
      setDecision('rejected');
      if (onReject) onReject(permission?.id);
    }
  }, [timeLeft, decision, isOpen, onReject, permission?.id]);

  const handleApprove = useCallback(() => {
    if (decision) return;
    setDecision('approved');
    if (onApprove) onApprove(permission?.id);
    setTimeout(() => {
      onClose();
    }, 600);
  }, [decision, onApprove, permission?.id, onClose]);

  const handleReject = useCallback(() => {
    if (decision) return;
    setDecision('rejected');
    if (onReject) onReject(permission?.id);
    setTimeout(() => {
      onClose();
    }, 600);
  }, [decision, onReject, permission?.id, onClose]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDecision(null);
      setTimeLeft(timeout);
    }
  }, [isOpen, timeout]);

  if (!isOpen || !permission) return null;

  const progressPercent = ((timeout - timeLeft) / timeout) * 100;
  const isUrgent = timeLeft <= 10;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[46px] z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        style={{
          background: 'var(--surface-muted)',
          borderColor: 'var(--border-strong)',
          borderWidth: 1,
        }}
        className="w-full max-w-md rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center gap-3 ${isUrgent ? 'border-amber-500/30 bg-amber-500/5' : ''}`}
          style={!isUrgent ? { borderBottomColor: 'var(--border-strong)' } : undefined}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${isUrgent ? 'bg-amber-500/10 text-amber-400' : ''}`}
            style={
              !isUrgent
                ? {
                    background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                    color: 'var(--accent-primary)',
                  }
                : undefined
            }
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Permiso Requerido
            </h3>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              {String(permission.description || '') || 'El agente necesita tu aprobación'}
            </p>
          </div>
          {/* Countdown */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold ${isUrgent ? 'bg-amber-500/10 text-amber-400' : ''}`}
            style={
              !isUrgent
                ? { background: 'var(--surface-hover)', color: 'var(--text-muted)' }
                : undefined
            }
          >
            <Clock className={`w-3 h-3 ${isUrgent ? 'animate-pulse' : ''}`} />
            {timeLeft}s
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background: 'var(--surface-hover)' }} className="h-1">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${isUrgent ? 'bg-amber-500' : ''}`}
            style={{
              width: `${progressPercent}%`,
              background: isUrgent ? undefined : 'var(--accent-primary)',
            }}
          />
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Tool info */}
          {permission.tool_name && (
            <div
              className="rounded-xl p-3"
              style={{
                background: 'var(--surface-elevated)',
                borderColor: 'var(--surface-hover)',
                borderWidth: 1,
              }}
            >
              <p
                className="text-[10px] uppercase font-bold mb-1.5 tracking-widest"
                style={{ color: 'var(--text-muted)', opacity: 0.6 }}
              >
                Herramienta
              </p>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-mono font-medium"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  {typeof permission.tool_name === 'string'
                    ? permission.tool_name
                    : JSON.stringify(permission.tool_name)}
                </span>
              </div>
              {permission.args && (
                <pre
                  className="mt-2 text-[11px] font-mono whitespace-pre-wrap break-all rounded p-2 max-h-24 overflow-auto"
                  style={{ color: 'var(--text-muted)', background: 'var(--surface-elevated)' }}
                >
                  {typeof permission.args === 'string'
                    ? permission.args
                    : JSON.stringify(permission.args, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Decision feedback */}
          {decision === 'approved' && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium animate-in fade-in">
              <Check className="w-4 h-4" /> Aprobado
            </div>
          )}
          {decision === 'rejected' && (
            <div className="flex items-center gap-2 text-red-400 text-sm font-medium animate-in fade-in">
              <AlertTriangle className="w-4 h-4" /> Rechazado
            </div>
          )}
        </div>

        {/* Actions */}
        {!decision && (
          <div className="px-5 pb-5 flex gap-3">
            <button
              onClick={handleApprove}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium text-sm hover:bg-emerald-500/20 transition-colors"
            >
              <Check className="w-4 h-4" /> Aprobar
            </button>
            <button
              onClick={handleReject}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-medium text-sm hover:bg-red-500/20 transition-colors"
            >
              <X className="w-4 h-4" /> Rechazar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
