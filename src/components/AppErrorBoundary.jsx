'use client';

import React from 'react';

const ENDPOINT = '/api/client-log';

function reportCrash(error, errorInfo) {
  try {
    const payload = {
      level: 'error',
      message: error?.message || String(error),
      source: 'react-error-boundary',
      ts: Date.now(),
      href: typeof window !== 'undefined' ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      details: {
        name: error?.name || null,
        stack: error?.stack || null,
        componentStack: errorInfo?.componentStack || null,
      },
    };
    navigator.sendBeacon?.(
      ENDPOINT,
      new Blob([JSON.stringify(payload)], { type: 'application/json' })
    ) ||
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
  } catch {
    // never throw from crash reporter
  }
}

/**
 * Top-level boundary so a single render crash does not blank the entire
 * styled app into "plain HTML". Logs to data/logs/crash.log via /api/client-log.
 */
export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    reportCrash(error, errorInfo);
  }

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || 'Error de render';
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0d0d0d',
            color: '#e6edf3',
            fontFamily: 'system-ui, sans-serif',
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 480,
              border: '1px solid #30363d',
              borderRadius: 12,
              padding: 24,
              background: '#161b22',
            }}
          >
            <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>DevHub se detuvo aquí</h1>
            <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 12px' }}>
              Un error de React tumbó la vista (a veces se ve como “HTML plano” sin estilos). El
              detalle se guardó en <code>data/logs/crash.log</code>.
            </p>
            <pre
              style={{
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: '#0d1117',
                padding: 12,
                borderRadius: 8,
                margin: '0 0 16px',
                color: '#f85149',
              }}
            >
              {msg}
            </pre>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#238636',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Recargar
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #30363d',
                  background: 'transparent',
                  color: '#e6edf3',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Reintentar sin recargar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
