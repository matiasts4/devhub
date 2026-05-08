'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Loader2, RotateCcw, Wifi, WifiOff, X } from 'lucide-react';
import { getTerminalTheme } from '@/components/terminal/TerminalThemeSync';

/**
 * Fire-and-forget logger → POST to /api/terminal/log (writes to data/logs/terminal-debug.log).
 * Never awaited — diagnostic only, does not affect control flow.
 */
function cliLog(tag, msg, extra = {}) {
  try {
    fetch('/api/terminal/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag, msg, extra }),
    }).catch(() => {});
  } catch {
    // never crash
  }
}

/**
 * Pure function: returns Framer Motion animation props for the xterm container.
 * Fades in (opacity 0→1, 150ms ease-out) when connection is established.
 *
 * @param {boolean} connected - whether the terminal is connected
 * @returns {{ initial, animate, transition }} Framer Motion props
 */
export function getXtermContainerAnimProps(connected) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: connected ? 1 : 0 },
    transition: { duration: 0.15, ease: 'easeOut' },
  };
}

export function refreshTerminalViewport(term) {
  if (!term || typeof term.refresh !== 'function' || !Number.isInteger(term.rows) || term.rows <= 0) {
    return false;
  }

  term.refresh(0, term.rows - 1);
  return true;
}

export function stabilizeTerminalRenderer(term) {
  if (!term) return false;

  if (typeof term.clearTextureAtlas === 'function') {
    term.clearTextureAtlas();
  }

  return refreshTerminalViewport(term);
}

export function fitTerminalViewport({ container, fitAddon, term, socket, websocketOpenState = WebSocket.OPEN }) {
  if (!container || !fitAddon || !term) return false;

  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  fitAddon.fit();
  stabilizeTerminalRenderer(term);

  if (socket?.readyState === websocketOpenState) {
    socket.send(
      JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows,
      })
    );
  }

  return true;
}

export function resolveTerminalConnectionCloseState(previousState, didReceiveProcessExit) {
  if (didReceiveProcessExit || previousState === 'terminated') {
    return 'terminated';
  }

  return previousState === 'error' ? 'error' : 'disconnected';
}

export function shouldAutoReconnectTerminal(connectionState, autoFocus) {
  if (!autoFocus) return false;
  return connectionState === 'disconnected' || connectionState === 'error';
}

export const TERMINAL_VIEWPORT_SHELL_STYLE = Object.freeze({
  contain: 'layout paint size',
  isolation: 'isolate',
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden',
});

export default function TerminalTTY({
  id,
  onClose,
  cwd,
  autoFocus,
  hideTitleBar,
  initialCommand,
  restored,
  showQuickCopyButton = true,
}) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const wsRef = useRef(null);
  const searchRef = useRef(null);
  const transportRef = useRef('json');

  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState(null);
  const [connectionState, setConnectionState] = useState('idle');
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [restoredToast, setRestoredToast] = useState(false);
  const hasSentInitialCommand = useRef(false);
  const processExitedRef = useRef(false);
  const rafRef = useRef(null);
  const timeoutRef = useRef(null);
  const initTimeoutRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const waitForVisibleDimensions = useCallback(async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const container = containerRef.current;
      if (!container) return false;

      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && document.visibilityState !== 'hidden') {
        return true;
      }

      await new Promise((resolve) => {
        rafRef.current = requestAnimationFrame(() => {
          timeoutRef.current = setTimeout(resolve, 40);
        });
      });
    }

    const rect = containerRef.current?.getBoundingClientRect();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  }, []);

  const fitAndResize = useCallback(() => {
    fitTerminalViewport({
      container: containerRef.current,
      fitAddon: fitRef.current,
      term: termRef.current,
      socket: wsRef.current,
    });
  }, []);

  const sendResize = useCallback(() => {
    if (!termRef.current || !fitRef.current) return;
    fitAndResize();
    clearTimers();
    rafRef.current = requestAnimationFrame(() => fitAndResize());
    timeoutRef.current = setTimeout(() => fitAndResize(), 120);
  }, [fitAndResize, clearTimers]);

  const reactivateTerminalViewport = useCallback(() => {
    const repaint = () => {
      stabilizeTerminalRenderer(termRef.current);
    };

    sendResize();
    repaint();

    rafRef.current = requestAnimationFrame(() => {
      repaint();

      if (autoFocus) {
        termRef.current?.focus?.();
      }

      timeoutRef.current = setTimeout(() => {
        sendResize();
        repaint();
      }, 120);
    });
  }, [autoFocus, sendResize]);

  const connect = useCallback(async () => {
    setConnectionState('connecting');
    processExitedRef.current = false;

    cliLog(`CLIENT:${id}`, 'connect() called', { cwd, autoFocus });

    try {
      // Silence the stale socket BEFORE closing it so its onclose doesn't
      // override 'connecting' back to 'disconnected' and trigger a reconnect loop.
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
        stale.close();
        wsRef.current = null;
        cliLog(`CLIENT:${id}`, 'stale socket silenced+closed');
      }

      const cwdParam = cwd ? `cwd=${encodeURIComponent(cwd)}` : '';
      const sessionIdParam = id ? `sessionId=${encodeURIComponent(id)}` : '';
      const legacyIdParam = id ? `id=${encodeURIComponent(id)}` : '';
      const queryParams = [cwdParam, sessionIdParam, legacyIdParam].filter(Boolean).join('&');
      const queryStr = queryParams ? `?${queryParams}` : '';

      console.log(`[TTY:${id}] Connecting to /api/terminal/session${queryStr}`);
      cliLog(`CLIENT:${id}`, 'fetching session API', { queryStr });
      const sessionResponse = await fetch(`/api/terminal/session${queryStr}`, {
        cache: 'no-store',
      });
      if (!sessionResponse.ok) {
        const errText = await sessionResponse.text().catch(() => '');
        console.error(`[TTY:${id}] Session API failed: ${sessionResponse.status}`, errText);
        cliLog(`CLIENT:${id}`, 'session API FAILED', { status: sessionResponse.status, body: errText });
        throw new Error(`No se pudo crear la sesión de terminal (${sessionResponse.status}).`);
      }

      const { port, wsPath } = await sessionResponse.json();
      console.log(`[TTY:${id}] Got port=${port}, wsPath=${wsPath}`);
      cliLog(`CLIENT:${id}`, 'session API ok', { port, wsPath });
      transportRef.current = wsPath === '/' ? 'raw' : 'json';
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProtocol}://127.0.0.1:${port}${wsPath}${queryStr}`;
      console.log(`[TTY:${id}] WebSocket URL: ${wsUrl}`);
      cliLog(`CLIENT:${id}`, 'opening WebSocket', { wsUrl });
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          console.error(`[TTY:${id}] WebSocket connection timeout after 10s`);
          cliLog(`CLIENT:${id}`, 'WS connection TIMEOUT (10s)', { readyState: socket.readyState });
          socket.close();
          setConnectionState('error');
        }
      }, 10000);

      socket.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log(`[TTY:${id}] WebSocket connected`);
        cliLog(`CLIENT:${id}`, 'WS onopen — connected');
        setConnectionState('connected');
        sendResize();

        // Show restored toast for sessions from previous run
        if (restored && cwd) {
          setRestoredToast(true);
          setTimeout(() => setRestoredToast(false), 2000);
        }

        // Only send initial command once per component lifecycle to avoid rerunning on fast reconnects
        if (initialCommand && !hasSentInitialCommand.current) {
          console.log(`[TTY:${id}] Sending initial command: ${initialCommand}`);
          if (transportRef.current === 'raw') {
            socket.send(initialCommand + '\r');
          } else {
            socket.send(JSON.stringify({ type: 'input', data: initialCommand + '\r' }));
          }
          hasSentInitialCommand.current = true;
        }
        // Initial focus handled by the other useEffect
      };

      socket.onmessage = (event) => {
        if (transportRef.current === 'raw') {
          if (typeof event.data === 'string' && event.data.length > 0) {
            termRef.current?.write(event.data);
          }
          return;
        }

        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'output' && typeof payload.data === 'string') {
            termRef.current?.write(payload.data);
            return;
          }

          if (payload.type === 'exit') {
            processExitedRef.current = true;
            cliLog(`CLIENT:${id}`, 'received exit from server');
            setConnectionState('terminated');
            termRef.current?.writeln('\r\n\x1b[33m[Sesión finalizada. Reconectá para iniciar una nueva shell.]\x1b[0m');
            window.dispatchEvent(
              new CustomEvent('devhub:terminal-exit', {
                detail: { id, initialCommand },
              })
            );
          }

          // The server detected an OpenCode session ID in this terminal — propagate it
          // so TerminalWorkspacesManager can persist it and restore it after reboots.
          if (payload.type === 'opencode-session-detected' && payload.sessionId) {
            window.dispatchEvent(
              new CustomEvent('devhub:opencode-session-detected', {
                detail: { panelId: id, sessionId: payload.sessionId },
              })
            );
            return;
          }

          if (payload.type === 'hermes-session-detected' && payload.sessionId) {
            window.dispatchEvent(
              new CustomEvent('devhub:hermes-session-detected', {
                detail: { panelId: id, sessionId: payload.sessionId },
              })
            );
            return;
          }
        } catch {
          if (typeof event.data === 'string' && event.data.length > 0) {
            termRef.current?.write(event.data);
          }
        }
      };

      socket.onerror = (err) => {
        clearTimeout(connectionTimeout);
        console.error(`[TTY:${id}] WebSocket error:`, err);
        cliLog(`CLIENT:${id}`, 'WS onerror');
        setConnectionState('error');
      };

      socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log(`[TTY:${id}] WebSocket closed: code=${event.code}, reason=${event.reason}`);
        cliLog(`CLIENT:${id}`, 'WS onclose', { code: event.code, reason: event.reason, wasClean: event.wasClean });
        setConnectionState((prev) => resolveTerminalConnectionCloseState(prev, processExitedRef.current));
      };
    } catch (error) {
      console.error(`[TTY:${id}] Connection failed:`, error);
      cliLog(`CLIENT:${id}`, 'connect() catch', { error: error?.message });
      setConnectionState('error');
    }
  }, [sendResize, cwd, initialCommand, id]);

  const reconnect = useCallback(() => {
    processExitedRef.current = false;
    cliLog(`CLIENT:${id}`, 'reconnect() called');
    termRef.current?.clear();
    // connect() already silences and closes the stale socket — just call it directly.
    connect();
  }, [connect]);

  useEffect(() => {
    let mounted = true;

    async function initializeTerminal() {
      cliLog(`CLIENT:${id}`, 'initializeTerminal() start', { cwd, autoFocus });
      const [{ Terminal }, { FitAddon }, { SearchAddon }] = await Promise.all([
        import('xterm'),
        import('xterm-addon-fit'),
        import('xterm-addon-search'),
      ]);

      if (!mounted || !containerRef.current) {
        cliLog(`CLIENT:${id}`, 'initializeTerminal() aborted — unmounted or no container (after import)');
        return;
      }

      const ready = await waitForVisibleDimensions();
      cliLog(`CLIENT:${id}`, 'waitForVisibleDimensions done', {
        ready,
        width: containerRef.current?.getBoundingClientRect().width,
        height: containerRef.current?.getBoundingClientRect().height,
      });
      if (!mounted || !containerRef.current) {
        cliLog(`CLIENT:${id}`, 'initializeTerminal() aborted — unmounted after waitForVisibleDimensions');
        setIsInitializing(false);
        return;
      }

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        allowTransparency: false,
        theme: getTerminalTheme(),
      });

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(searchAddon);
      terminal.open(containerRef.current);

      if (ready) {
        fitAddon.fit();
      }

      terminal.onData((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          if (transportRef.current === 'raw') {
            wsRef.current.send(data);
          } else {
            wsRef.current.send(JSON.stringify({ type: 'input', data }));
          }
        }
      });

      resizeObserverRef.current = new ResizeObserver(() => {
        sendResize();
      });
      resizeObserverRef.current.observe(containerRef.current);

      termRef.current = terminal;
      fitRef.current = fitAddon;
      searchRef.current = searchAddon;

      setInitError(null);
      setIsInitializing(false);
      connect();

      sendResize();
    }

    initializeTerminal();

    return () => {
      mounted = false;
      clearTimers();
      resizeObserverRef.current?.disconnect();
      // Silence the socket before closing so it doesn't set 'disconnected'
      // on the (possibly re-mounting) component during React Strict Mode double-invoke.
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
        stale.close();
        wsRef.current = null;
      }
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
  }, [connect, sendResize, fitAndResize, clearTimers, waitForVisibleDimensions]);

  useEffect(() => {
    const handleSearch = (event) => {
      const detail = event.detail || {};
      const targetId = detail.targetId;
      const query = detail.query;
      const direction = detail.direction || 'next';

      if (!targetId || targetId !== id || !query || !searchRef.current) return;

      if (direction === 'prev') {
        searchRef.current.findPrevious(query, { caseSensitive: false, incremental: true });
        return;
      }

      searchRef.current.findNext(query, { caseSensitive: false, incremental: true });
    };

    window.addEventListener('devhub:terminal-search', handleSearch);
    return () => window.removeEventListener('devhub:terminal-search', handleSearch);
  }, [id]);

  // Handle focus when tab becomes active
  useEffect(() => {
    if (!autoFocus || !termRef.current) return undefined;

    const focusTimer = setTimeout(() => {
      termRef.current?.focus?.();
      reactivateTerminalViewport();
    }, 50);

    return () => clearTimeout(focusTimer);
  }, [autoFocus, reactivateTerminalViewport]);

  // Auto-reconnect when disconnected or error, with exponential backoff.
  // No hard attempt limit — the EBADF server fix prevents infinite hammering.
  // Backoff: 300ms → 600ms → 1200ms → 2400ms → 5000ms (max), then stays at 5s.
  const reconnectAttemptsRef = useRef(0);
  // Track autoFocus changes to reset the counter when the user switches to this tab.
  const prevAutoFocusRef = useRef(autoFocus);
  useEffect(() => {
    if (autoFocus && !prevAutoFocusRef.current) {
      // User actively switched to this terminal — give it a fresh reconnect budget.
      reconnectAttemptsRef.current = 0;
    }
    prevAutoFocusRef.current = autoFocus;
  }, [autoFocus]);

  useEffect(() => {
    if (shouldAutoReconnectTerminal(connectionState, autoFocus)) {
      if (!autoFocus) {
        cliLog(`CLIENT:${id}`, 'auto-reconnect SKIPPED (not autoFocus)', { connectionState });
        return;
      }
      const delay = Math.min(300 * 2 ** reconnectAttemptsRef.current, 5000);
      cliLog(`CLIENT:${id}`, 'auto-reconnect scheduled', {
        connectionState,
        attempt: reconnectAttemptsRef.current,
        delayMs: delay,
      });
      const timer = setTimeout(() => {
        reconnectAttemptsRef.current += 1;
        reconnect();
      }, delay);
      return () => clearTimeout(timer);
    }
    // Reset counter on stable connection — next disconnect starts from 300ms again.
    if (connectionState === 'connected') {
      cliLog(`CLIENT:${id}`, 'connected — resetting reconnect counter');
      reconnectAttemptsRef.current = 0;
    }
  }, [autoFocus, connectionState, reconnect]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        reactivateTerminalViewport();
      }
    };

    const handleWindowResize = () => sendResize();
    const handleWindowFocus = () => reactivateTerminalViewport();
    const handlePageShow = () => reactivateTerminalViewport();

    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [reactivateTerminalViewport, sendResize]);

  // ── Custom context menu for terminal ────────────────────────────────────────
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = termRef.current?.getSelection();
    if (text) {
      setContextMenu({ x: e.clientX, y: e.clientY, text });
    }
  }, []);

  const handleCopyFromMenu = useCallback(async () => {
    if (contextMenu?.text) {
      try {
        await navigator.clipboard.writeText(contextMenu.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Fallback: select all and copy
        const textarea = document.createElement('textarea');
        textarea.value = contextMenu.text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    }
    setContextMenu(null);
  }, [contextMenu]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // ── Keyboard shortcut: Ctrl+Shift+C to copy ─────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        e.stopPropagation();
        const text = termRef.current?.getSelection();
        if (text) {
          navigator.clipboard.writeText(text).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
          });
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const isConnected = connectionState === 'connected';
  const statusLabel = isConnected
    ? 'Conectado'
    : connectionState === 'connecting'
      ? 'Conectando...'
      : connectionState === 'terminated'
        ? 'Finalizada'
      : 'Desconectado';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[var(--surface-app)] relative">
      {!hideTitleBar && (
        <div className="devhub-drag-handle h-9 bg-[#212121] flex items-center justify-between px-3 shrink-0 border-b border-white/5 select-none hover:bg-[#2a2a2a] transition-colors group/handle cursor-pointer">
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-gray-300 pointer-events-none">
            <svg
              className="w-4 h-4 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 17 10 11 4 5" />
              <line x1={12} y1={19} x2={20} y2={19} />
            </svg>
            <span className="text-gray-400">Terminal Integrada</span>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-60">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-[#3fb950]" strokeWidth={2} />
            ) : (
              <WifiOff className="w-3 h-3 text-[#ff7b72]" strokeWidth={2} />
            )}
            <span
              className={`text-xs font-sans tracking-wide uppercase font-semibold ${isConnected ? 'text-[#3fb950]' : 'text-[#ff7b72]'}`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={reconnect}
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-gray-400 group-hover:text-white" strokeWidth={2} />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group cursor-pointer"
              >
                <X
                  className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#ff7b72]"
                  strokeWidth={2}
                />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Terminal View */}
      <div
        className="relative flex-1 bg-[var(--surface-app)]"
        onContextMenu={handleContextMenu}
        data-testid="terminal-viewport-shell"
        style={TERMINAL_VIEWPORT_SHELL_STYLE}
      >
        <motion.div
          ref={containerRef}
          className="devhub-xterm-container h-full w-full p-2.5"
          {...getXtermContainerAnimProps(isConnected)}
        />

        {/* Restored session toast */}
        {restoredToast && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-md border text-xs font-mono pointer-events-none"
            style={{
              background: 'color-mix(in oklch, var(--accent-primary) 15%, var(--surface-elevated))',
              borderColor: 'var(--accent-primary)',
              color: 'var(--accent-primary)',
            }}
          >
            ↺ Restored shell at {cwd}
          </div>
        )}

        {/* Loading overlay — only during init or connecting */}
        {(isInitializing || connectionState === 'connecting') && (
          <div className="absolute inset-0 bg-[var(--surface-app)]/80 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-10 backdrop-blur-sm">
            <Loader2 className="w-6 h-6 animate-spin text-[#388bfd]" />
            {connectionState === 'connecting' ? 'Conectando...' : 'Iniciando terminal...'}
          </div>
        )}

        {/* Error/Disconnected overlay */}
        {(initError || connectionState === 'error' || connectionState === 'disconnected') && !isInitializing && (
          <div className="absolute inset-0 bg-[var(--surface-app)]/90 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-10 backdrop-blur-sm">
            <WifiOff className="w-8 h-8 text-red-400" />
            <span className="text-red-400 font-semibold">
              {initError
                ? 'Terminal no visible todavía'
                : connectionState === 'error'
                  ? 'Error de conexión'
                  : connectionState === 'terminated'
                    ? 'Sesión finalizada'
                  : 'Desconectado'}
            </span>
            <span className="text-gray-500 text-center max-w-xs">
              {initError ||
                (connectionState === 'error'
                ? 'No se pudo conectar al servidor de terminal. Verificá que el servidor esté corriendo.'
                : connectionState === 'terminated'
                  ? 'La sesión terminó. Reconectá para iniciar una shell nueva sin relanzar el comando inicial.'
                  : 'La conexión con la terminal se perdió.')}
            </span>
            <button
              onClick={reconnect}
              className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e1e1e] border border-white/10 hover:bg-white/10 transition-colors text-gray-300"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reconectar
            </button>
          </div>
        )}

        {/* Copy button — top-right corner */}
        {isConnected && showQuickCopyButton && (
          <button
            onClick={async () => {
              if (termRef.current) {
                try {
                  const text = termRef.current.getSelection();
                  if (text) {
                    await navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }
                } catch {
                  // Clipboard API may not be available
                }
              }
            }}
            className="absolute top-2 right-2 z-20 p-1.5 rounded-md bg-[#1e1e1e]/90 border border-white/10 hover:bg-white/10 transition-colors"
            title="Copiar selección"
          >
            <Copy className={`w-3.5 h-3.5 ${copied ? 'text-[#3fb950]' : 'text-gray-400'}`} />
          </button>
        )}

        {/* Custom context menu */}
        {contextMenu && (
          <div
            className="fixed z-50 min-w-[160px] rounded-lg border shadow-xl animate-in fade-in zoom-in-95 duration-100"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              background: '#1e1e1e',
              borderColor: '#3a3a3a',
            }}
          >
            <button
              onClick={handleCopyFromMenu}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-lg"
            >
              <Copy className="w-3.5 h-3.5 text-gray-400" />
              Copiar selección
              <span className="ml-auto text-[10px] text-gray-500 font-mono">Ctrl+Shift+C</span>
            </button>
            <div className="h-px bg-[#3a3a3a] mx-2 my-1" />
            <button
              onClick={() => setContextMenu(null)}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a] transition-colors rounded-lg"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
