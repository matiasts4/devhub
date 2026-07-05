/**
 * useTerminalSearchAndZedInput — global search + zed input listeners.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 1).
 */
import { useEffect } from 'react';
import { sendTerminalPasteInput } from '@/components/terminal/TerminalTTY.helpers';

export default function useTerminalSearchAndZedInput({ ctxRef }) {
  useEffect(() => {
    const c = ctxRef.current;
    const { id, searchRef } = c;

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
  }, [ctxRef]);

  useEffect(() => {
    const c = ctxRef.current;
    const { id, wsRef, transportRef } = c;

    const handleZedInput = (event) => {
      const detail = event?.detail;
      const target = detail?.terminalId || detail?.session_id || detail?.panelId;
      if (!detail || target !== id) return;
      sendTerminalPasteInput({
        socket: wsRef.current,
        transport: transportRef.current,
        text: detail.input,
      });
    };
    window.addEventListener('devhub:zed-terminal-input', handleZedInput);
    return () => window.removeEventListener('devhub:zed-terminal-input', handleZedInput);
  }, [ctxRef]);
}
