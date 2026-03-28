'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, Wifi, WifiOff, X } from 'lucide-react';

export default function TerminalTTY({ onClose, cwd, autoFocus, hideTitleBar }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const wsRef = useRef(null);

  const [isInitializing, setIsInitializing] = useState(true);
  const [connectionState, setConnectionState] = useState('idle');

  const sendResize = useCallback(() => {
    if (!fitRef.current || !termRef.current || !wsRef.current) return;
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

  const connect = useCallback(async () => {
    setConnectionState('connecting');

    try {
      const cwdParam = cwd ? `?cwd=${encodeURIComponent(cwd)}` : '';
      const sessionResponse = await fetch(`/api/terminal/session${cwdParam}`, { cache: 'no-store' });
      if (!sessionResponse.ok) {
        throw new Error('No se pudo crear la sesión de terminal.');
      }

      const { port, wsPath } = await sessionResponse.json();
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProtocol}://127.0.0.1:${port}${wsPath}${cwdParam}`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setConnectionState('connected');
        sendResize();
        if (autoFocus !== false) termRef.current?.focus();
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'output' && typeof payload.data === 'string') {
            termRef.current?.write(payload.data);
            return;
          }

          if (payload.type === 'exit') {
            termRef.current?.writeln('\r\n\x1b[31mProceso de terminal finalizado.\x1b[0m');
          }
        } catch {
          // Ignore malformed frames.
        }
      };

      socket.onerror = () => {
        setConnectionState('error');
      };

      socket.onclose = () => {
        setConnectionState((prev) => (prev === 'error' ? 'error' : 'disconnected'));
      };
    } catch (error) {
      console.error(error);
      setConnectionState('error');
    }
  }, [sendResize, cwd, autoFocus]);

  const reconnect = useCallback(() => {
    termRef.current?.clear();
    wsRef.current?.close();
    connect();
  }, [connect]);

  useEffect(() => {
    let mounted = true;

    async function initializeTerminal() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('xterm'),
        import('xterm-addon-fit'),
      ]);

      if (!mounted || !containerRef.current) return;

      const style = getComputedStyle(document.body);
      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        allowTransparency: true,
        theme: {
          background: 'transparent',
          foreground: '#F0F6FC',
          cursor: '#58A6FF',
          black: '#484F58',
          red: '#FF7B72',
          green: '#3FB950',
          yellow: '#D29922',
          blue: '#58A6FF',
          magenta: '#BC8CFF',
          cyan: '#39C5CF',
          white: '#B1BAC4',
          brightBlack: '#6E7681',
          brightRed: '#FFA198',
          brightGreen: '#56D364',
          brightYellow: '#E3B341',
          brightBlue: '#79C0FF',
          brightMagenta: '#D2A8FF',
          brightCyan: '#56D4DD',
          brightWhite: '#F0F6FC',
        },
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      fitAddon.fit();

      terminal.onData((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'input', data }));
        }
      });

      resizeObserverRef.current = new ResizeObserver(() => {
        sendResize();
      });
      resizeObserverRef.current.observe(containerRef.current);

      termRef.current = terminal;
      fitRef.current = fitAddon;

      setIsInitializing(false);
      connect();
    }

    initializeTerminal();

    return () => {
      mounted = false;
      resizeObserverRef.current?.disconnect();
      wsRef.current?.close();
      termRef.current?.dispose();
    };
  }, [connect, sendResize]);

  // Handle focus when tab becomes active
  useEffect(() => {
    if (autoFocus && termRef.current) {
      setTimeout(() => termRef.current.focus(), 50);
    }
  }, [autoFocus]);

  const isConnected = connectionState === 'connected';
  const statusLabel = isConnected ? 'Conectado' : connectionState === 'connecting' ? 'Conectando...' : 'Desconectado';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#111111] relative">
      {!hideTitleBar && (
        <div className="devhub-drag-handle h-9 bg-[#212121] flex items-center justify-between px-3 shrink-0 border-b border-white/5 select-none hover:bg-[#2a2a2a] transition-colors group/handle">
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-gray-300 pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1={12} y1={19} x2={20} y2={19} /></svg>
            <span className="text-gray-400">Terminal Integrada</span>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-60">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-[#3fb950]" strokeWidth={2} />
            ) : (
              <WifiOff className="w-3 h-3 text-[#ff7b72]" strokeWidth={2} />
            )}
            <span className={`text-[10px] font-sans tracking-wide uppercase font-semibold ${isConnected ? 'text-[#3fb950]' : 'text-[#ff7b72]'}`}>{statusLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={reconnect} className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group">
              <RotateCcw className="w-3 h-3 text-gray-400 group-hover:text-white" strokeWidth={2} />
            </button>
            {onClose && (
              <button onClick={onClose} className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group">
                <X className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#ff7b72]" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Terminal View */}
      <div className="relative flex-1 bg-[#111111]">
        <div ref={containerRef} className="devhub-xterm-container h-full w-full p-2.5" />

        {(isInitializing || connectionState === 'connecting') && (
          <div className="absolute inset-0 bg-[#111111]/80 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-10 backdrop-blur-sm">
            <Loader2 className="w-6 h-6 animate-spin text-[#388bfd]" />
            Leyendo ~/.zshrc ...
          </div>
        )}
      </div>
    </div>
  );
}
