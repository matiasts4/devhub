'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Loader2, RotateCcw, Wifi, WifiOff, X } from 'lucide-react';
import { getTerminalTheme } from '@/components/terminal/TerminalThemeSync';

export default function TerminalTTY({ id, onClose, cwd, autoFocus, hideTitleBar, initialCommand }) {
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
  const hasSentInitialCommand = useRef(false);
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
    if (!fitRef.current || !termRef.current || !wsRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    fitRef.current.fit();

    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'resize',
          cols: termRef.current.cols,
          rows: termRef.current.rows,
        })
      );
    }
  }, []);

  const sendResize = useCallback(() => {
    if (!termRef.current || !fitRef.current) return;
    fitAndResize();
    clearTimers();
    rafRef.current = requestAnimationFrame(() => fitAndResize());
    timeoutRef.current = setTimeout(() => fitAndResize(), 120);
  }, [fitAndResize, clearTimers]);

  const connect = useCallback(async () => {
    setConnectionState('connecting');
    hasSentInitialCommand.current = false;

    try {
      wsRef.current?.close();
      const cwdParam = cwd ? `cwd=${encodeURIComponent(cwd)}` : '';
      const sessionIdParam = id ? `sessionId=${encodeURIComponent(id)}` : '';
      const legacyIdParam = id ? `id=${encodeURIComponent(id)}` : '';
      const queryParams = [cwdParam, sessionIdParam, legacyIdParam].filter(Boolean).join('&');
      const queryStr = queryParams ? `?${queryParams}` : '';

      console.log(`[TTY:${id}] Connecting to /api/terminal/session${queryStr}`);
      const sessionResponse = await fetch(`/api/terminal/session${queryStr}`, {
        cache: 'no-store',
      });
      if (!sessionResponse.ok) {
        const errText = await sessionResponse.text().catch(() => '');
        console.error(`[TTY:${id}] Session API failed: ${sessionResponse.status}`, errText);
        throw new Error(`No se pudo crear la sesión de terminal (${sessionResponse.status}).`);
      }

      const { port, wsPath } = await sessionResponse.json();
      console.log(`[TTY:${id}] Got port=${port}, wsPath=${wsPath}`);
      transportRef.current = wsPath === '/' ? 'raw' : 'json';
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProtocol}://127.0.0.1:${port}${wsPath}${queryStr}`;
      console.log(`[TTY:${id}] WebSocket URL: ${wsUrl}`);
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          console.error(`[TTY:${id}] WebSocket connection timeout after 10s`);
          socket.close();
          setConnectionState('error');
        }
      }, 10000);

      socket.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log(`[TTY:${id}] WebSocket connected`);
        setConnectionState('connected');
        sendResize();
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
            termRef.current?.writeln('\r\n\x1b[31mProceso de terminal finalizado.\x1b[0m');
            window.dispatchEvent(
              new CustomEvent('devhub:terminal-exit', {
                detail: { id, initialCommand },
              })
            );
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
        setConnectionState('error');
      };

      socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log(`[TTY:${id}] WebSocket closed: code=${event.code}, reason=${event.reason}`);
        setConnectionState((prev) => (prev === 'error' ? 'error' : 'disconnected'));
      };
    } catch (error) {
      console.error(`[TTY:${id}] Connection failed:`, error);
      setConnectionState('error');
    }
  }, [sendResize, cwd, initialCommand, id]);

  const reconnect = useCallback(() => {
    hasSentInitialCommand.current = false;
    termRef.current?.clear();
    wsRef.current?.close();
    connect();
  }, [connect]);

  useEffect(() => {
    let mounted = true;

    async function initializeTerminal() {
      const [{ Terminal }, { FitAddon }, { SearchAddon }] = await Promise.all([
        import('xterm'),
        import('xterm-addon-fit'),
        import('xterm-addon-search'),
      ]);

      if (!mounted || !containerRef.current) return;

      const ready = await waitForVisibleDimensions();
      if (!mounted || !containerRef.current) {
        setIsInitializing(false);
        return;
      }
      if (!ready) {
        setInitError('El contenedor de terminal no tiene dimensiones visibles.');
        setIsInitializing(false);
        return;
      }

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        allowTransparency: true,
        theme: getTerminalTheme(),
      });

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(searchAddon);
      terminal.open(containerRef.current);
      fitAddon.fit();

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

      setIsInitializing(false);
      connect();

      sendResize();
    }

    initializeTerminal();

    return () => {
      mounted = false;
      clearTimers();
      resizeObserverRef.current?.disconnect();
      wsRef.current?.close();
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      wsRef.current = null;
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
    if (autoFocus && termRef.current) {
      setTimeout(() => termRef.current.focus(), 50);
    }
  }, [autoFocus]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendResize();
      }
    };

    const handleWindowResize = () => sendResize();

    window.addEventListener('resize', handleWindowResize);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sendResize]);

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
      : 'Desconectado';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#111111] relative">
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
      <div className="relative flex-1 bg-[#111111]" onContextMenu={handleContextMenu}>
        <div ref={containerRef} className="devhub-xterm-container h-full w-full p-2.5" />

        {/* Loading overlay — only during init or connecting */}
        {(isInitializing || connectionState === 'connecting') && (
          <div className="absolute inset-0 bg-[#111111]/80 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-10 backdrop-blur-sm">
            <Loader2 className="w-6 h-6 animate-spin text-[#388bfd]" />
            {connectionState === 'connecting' ? 'Conectando...' : 'Iniciando terminal...'}
          </div>
        )}

        {/* Error/Disconnected overlay */}
        {(connectionState === 'error' || connectionState === 'disconnected') && !isInitializing && (
          <div className="absolute inset-0 bg-[#111111]/90 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-10 backdrop-blur-sm">
            <WifiOff className="w-8 h-8 text-red-400" />
            <span className="text-red-400 font-semibold">
              {connectionState === 'error' ? 'Error de conexión' : 'Desconectado'}
            </span>
            <span className="text-gray-500 text-center max-w-xs">
              {connectionState === 'error'
                ? 'No se pudo conectar al servidor de terminal. Verificá que el servidor esté corriendo.'
                : 'La conexión con la terminal se perdió.'}
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
        {isConnected && (
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
