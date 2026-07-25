import { X, Trash2, Cpu, HardDrive, Activity } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function ProcessRow({ process, onKill, killing }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'var(--surface-app)',
      }}
    >
      <div className="flex min-w-[60px] flex-col">
        <span className="font-mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          PID {process.pid}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {process.agent}
        </span>
      </div>

      <div className="flex flex-1 items-center gap-4">
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Cpu size={12} />
          <span>{process.cpu?.toFixed(1)}%</span>
        </div>
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          <HardDrive size={12} />
          <span>{formatBytes((process.rss || 0) * 1024)}</span>
        </div>
        {process.workspace && (
          <div
            className="truncate text-xs"
            style={{ color: 'var(--text-muted)' }}
            title={process.workspace}
          >
            {process.workspace.split('/').pop()}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onKill(process.pid)}
        disabled={killing}
        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
        style={{
          borderColor: 'rgba(239,68,68,0.3)',
          color: 'rgb(239,68,68)',
          background: 'rgba(239,68,68,0.08)',
        }}
      >
        <X size={12} />
        Matar
      </button>
    </div>
  );
}

export default function ActiveProcessesPanel() {
  const [processes, setProcesses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [killing, setKilling] = useState(new Set());
  const [error, setError] = useState(null);
  const [confirmKillAll, setConfirmKillAll] = useState(false);

  const fetchProcesses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/swarm/processes');
      if (!res.ok) throw new Error('Failed to fetch processes');
      const data = await res.json();
      setProcesses(data.processes || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchProcesses]);

  const handleKill = useCallback(
    async (pid, force = false) => {
      setKilling((prev) => new Set([...prev, pid]));
      try {
        const res = await fetch('/api/swarm/processes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'kill', pid, force }),
        });
        if (!res.ok) throw new Error('Failed to kill process');
        await fetchProcesses();
      } catch (err) {
        console.error('[ProcessPanel] Kill error:', err);
      } finally {
        setKilling((prev) => {
          const next = new Set(prev);
          next.delete(pid);
          return next;
        });
      }
    },
    [fetchProcesses]
  );

  const handleKillAll = useCallback(async () => {
    if (!confirmKillAll) {
      setConfirmKillAll(true);
      return;
    }
    setConfirmKillAll(false);

    try {
      const res = await fetch('/api/swarm/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'kill', all: true, force: false }),
      });
      if (!res.ok) throw new Error('Failed to kill all processes');
      await fetchProcesses();
    } catch (err) {
      console.error('[ProcessPanel] Kill all error:', err);
    }
  }, [processes.length, fetchProcesses, confirmKillAll]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: 'var(--text-secondary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Procesos OpenCode activos
          </h3>
          {summary && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                background: 'rgba(255,176,64,0.12)',
                color: 'rgba(255,176,64,0.9)',
              }}
            >
              {summary.count}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {summary && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {summary.totalMemoryMB} MB · {summary.totalCpu}% CPU
            </span>
          )}
          <button
            type="button"
            onClick={fetchProcesses}
            className="rounded-lg border px-2.5 py-1.5 text-xs"
            style={{
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            Refresh
          </button>
          {processes.length > 0 && (
            <div className="flex items-center gap-1.5">
              {confirmKillAll && (
                <button
                  type="button"
                  onClick={() => setConfirmKillAll(false)}
                  className="rounded-lg border px-2.5 py-1.5 text-xs"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={handleKillAll}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                style={{
                  borderColor: confirmKillAll ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.3)',
                  color: 'rgb(239,68,68)',
                  background: confirmKillAll ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.08)',
                }}
              >
                <Trash2 size={12} />
                {confirmKillAll ? `¿Matar ${processes.length} procesos?` : 'Matar todos'}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && processes.length === 0 ? (
        <div
          className="rounded-xl border px-4 py-8 text-center text-sm"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          Cargando procesos...
        </div>
      ) : processes.length === 0 ? (
        <div
          className="rounded-xl border px-4 py-8 text-center text-sm"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          No hay procesos opencode activos
        </div>
      ) : (
        <div className="space-y-2">
          {processes.map((p) => (
            <ProcessRow key={p.pid} process={p} onKill={handleKill} killing={killing.has(p.pid)} />
          ))}
        </div>
      )}
    </div>
  );
}
