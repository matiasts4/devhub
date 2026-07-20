/**
 * useTerminalClipboard — paste, copy, context-menu UI state and handlers.
 * Extracted from TerminalTTY.jsx.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  readClipboardImage,
  readClipboardText,
  saveClipboardImageToTempFile,
  terminalClipboardEventBelongsToPanel,
} from '@/lib/terminal/terminalClipboard';
import {
  cliLog,
  formatTerminalPastePayload,
  getClipboardApi,
  normalizeTerminalSelectionForClipboard,
  resolveTerminalClipboardShortcut,
  sendTerminalPasteInput,
  isMultilineTerminalPaste,
} from '@/components/terminal/TerminalTTY.helpers';
import { getStoredTerminalAutoCopy } from '@/components/terminal/terminalRendererPreferences';

export default function useTerminalClipboard({
  rendererRefs,
  sessionRefs,
  lifecycleRefs,
  viewportRefs,
  panelId,
  initialCommand,
  isActivePanel,
  shouldUseNativeRenderer,
  focusNativeVtePanel,
  pasteNativeVtePanel,
  handleNativeLeaseCommandError,
}) {
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const pasteInFlightRef = useRef(false);
  const [autoCopy, setAutoCopy] = useState(() => getStoredTerminalAutoCopy());

  useEffect(() => {
    const handler = (e) => {
      setAutoCopy(Boolean(e.detail));
    };
    window.addEventListener('devhub:terminal-auto-copy-changed', handler);
    return () => window.removeEventListener('devhub:terminal-auto-copy-changed', handler);
  }, []);

  const copyTextToClipboard = useCallback(async (text) => {
    const normalized = normalizeTerminalSelectionForClipboard(text);
    if (!normalized) return false;

    try {
      const clipboardApi = getClipboardApi();
      if (!clipboardApi?.writeText) {
        throw new Error('clipboard-unavailable');
      }
      await clipboardApi.writeText(normalized);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = normalized;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    return true;
  }, []);

  const handleCopySelection = useCallback(async () => {
    const termRef = rendererRefs?.current?.termRef;
    const text = termRef?.current?.getSelection?.() || contextMenu?.text || '';
    return copyTextToClipboard(text);
  }, [contextMenu?.text, copyTextToClipboard, rendererRefs]);

  const handlePasteIntoTerminal = useCallback(
    async ({ clipboardEvent, image: providedImage } = {}) => {
      if (pasteInFlightRef.current) {
        cliLog('[paste]', 'skipped duplicate paste (in flight)');
        return false;
      }
      pasteInFlightRef.current = true;
      cliLog('[paste]', 'handlePasteIntoTerminal called');

      const termRef = rendererRefs?.current?.termRef;
      const wsRef = sessionRefs?.current?.wsRef;
      const transportRef = sessionRefs?.current?.transportRef;

      try {
        const image = providedImage || (await readClipboardImage({ clipboardEvent }));
        if (image?.data) {
          cliLog(
            '[paste]',
            `clipboard image detected mime=${image.mimeType} len=${image.data.length}`
          );
          const tempPath = await saveClipboardImageToTempFile(image);
          if (!tempPath) {
            cliLog('[paste]', 'failed to save clipboard image to temp file');
            return false;
          }
          cliLog('[paste]', `saved clipboard image to temp path=${tempPath}`);
          const quotedPath = `"${tempPath.replace(/"/g, '\\"')}"`;

          if (shouldUseNativeRenderer) {
            cliLog('[paste]', `shouldUseNativeRenderer=true, image temp path=${tempPath}`);
            await Promise.resolve(focusNativeVtePanel({ panelId })).catch(
              handleNativeLeaseCommandError
            );
            const result = await pasteNativeVtePanel({ panelId, text: quotedPath });
            cliLog('[paste]', `pasteNativeVtePanel returned supported=${result?.supported}`);
            return Boolean(result?.supported);
          }

          const bracketedPath = `\x1b[200~${tempPath}\x1b[201~`;
          cliLog('[paste]', `pasting image path via forced bracketed paste`);
          if (
            sendTerminalPasteInput({
              socket: wsRef?.current,
              transport: transportRef?.current,
              text: bracketedPath,
            })
          ) {
            return true;
          }

          if (typeof termRef?.current?.paste === 'function') {
            cliLog('[paste]', `falling back to term.paste for image path`);
            termRef.current.paste(tempPath);
            return true;
          }

          return false;
        }

        const text = await readClipboardText({ clipboardEvent });
        if (!text) return false;

        const pastePayload = formatTerminalPastePayload(text, lifecycleRefs, initialCommand);
        const bracketed = pastePayload !== normalizeTerminalSelectionForClipboard(text);
        cliLog(
          '[paste]',
          `payload len=${pastePayload.length} lines=${(text.match(/\n/g) || []).length + 1} bracketed=${bracketed}`
        );

        if (shouldUseNativeRenderer) {
          cliLog('[paste]', `shouldUseNativeRenderer=true, clipboard text len=${text.length}`);
          await Promise.resolve(focusNativeVtePanel({ panelId })).catch(
            handleNativeLeaseCommandError
          );
          const result = await pasteNativeVtePanel({ panelId, text: pastePayload });
          cliLog('[paste]', `pasteNativeVtePanel returned supported=${result?.supported}`);
          return Boolean(result?.supported);
        }

        if (
          sendTerminalPasteInput({
            socket: wsRef?.current,
            transport: transportRef?.current,
            text: pastePayload,
          })
        ) {
          return true;
        }

        if (isMultilineTerminalPaste(pastePayload)) {
          cliLog('[paste]', 'refusing xterm.paste fallback for multiline (would split submits)');
          return false;
        }

        if (typeof termRef?.current?.paste === 'function') {
          termRef.current.paste(pastePayload);
          return true;
        }

        return false;
      } finally {
        pasteInFlightRef.current = false;
      }
    },
    [
      focusNativeVtePanel,
      handleNativeLeaseCommandError,
      initialCommand,
      lifecycleRefs,
      panelId,
      pasteNativeVtePanel,
      rendererRefs,
      sessionRefs,
      shouldUseNativeRenderer,
    ]
  );

  const handleContextMenu = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const termRef = rendererRefs?.current?.termRef;
      const text = termRef?.current?.getSelection?.() || '';
      setContextMenu({ x: e.clientX, y: e.clientY, text, canCopy: Boolean(text) });
    },
    [rendererRefs]
  );

  const handleCopyFromMenu = useCallback(async () => {
    await handleCopySelection();
    setContextMenu(null);
  }, [handleCopySelection]);

  const handlePasteFromMenu = useCallback(async () => {
    await handlePasteIntoTerminal().catch(() => false);
    setContextMenu(null);
  }, [handlePasteIntoTerminal]);

  const handleViewportPaste = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      void handlePasteIntoTerminal({ clipboardEvent: e }).catch(() => false);
    },
    [handlePasteIntoTerminal]
  );

  const dismissContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    const handler = (e) => {
      if (lifecycleRefs?.current?.isDisposingRef?.current) return;
      const termRef = rendererRefs?.current?.termRef;
      const rootElement = viewportRefs?.current?.terminalRootRef?.current;
      const activeElement = document?.activeElement || null;
      const eventTarget = e.target instanceof Node ? e.target : null;
      const belongsToTerminal = terminalClipboardEventBelongsToPanel({
        rootElement,
        activeElement,
        eventTarget,
        isActivePanel,
      });
      if (!belongsToTerminal) return;

      const raw = termRef?.current?.getSelection?.() || '';
      const text = normalizeTerminalSelectionForClipboard(raw);
      if (!text) return;

      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', text);
      }
      e.preventDefault();
      e.stopPropagation();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      cliLog('[copy]', `normalized terminal selection len=${text.length}`);
    };

    document.addEventListener('copy', handler, true);
    return () => document.removeEventListener('copy', handler, true);
  }, [isActivePanel, lifecycleRefs, rendererRefs, viewportRefs]);

  const routePasteFromPanel = useCallback(
    (e) => {
      if (lifecycleRefs?.current?.isDisposingRef?.current) return;
      const rootElement = viewportRefs?.current?.terminalRootRef?.current;
      const eventTarget = e.target instanceof Node ? e.target : null;
      if (!rootElement || !eventTarget || !rootElement.contains(eventTarget)) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      void handlePasteIntoTerminal({ clipboardEvent: e }).catch(() => false);
    },
    [handlePasteIntoTerminal, lifecycleRefs, viewportRefs]
  );

  useLayoutEffect(() => {
    const rootElement = viewportRefs?.current?.terminalRootRef?.current;
    if (!rootElement) return undefined;
    rootElement.addEventListener('paste', routePasteFromPanel, true);
    return () => rootElement.removeEventListener('paste', routePasteFromPanel, true);
  }, [routePasteFromPanel, viewportRefs]);

  useEffect(() => {
    const handler = (e) => {
      if (lifecycleRefs?.current?.isDisposingRef?.current) return;
      const rootElement = viewportRefs?.current?.terminalRootRef?.current;
      const activeElement = document?.activeElement || null;
      const eventTarget = e.target instanceof Node ? e.target : null;
      const belongsToTerminal = terminalClipboardEventBelongsToPanel({
        rootElement,
        activeElement,
        eventTarget,
        isActivePanel,
      });
      if (!belongsToTerminal) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      void handlePasteIntoTerminal({ clipboardEvent: e }).catch(() => false);
    };

    document.addEventListener('paste', handler, true);
    return () => document.removeEventListener('paste', handler, true);
  }, [handlePasteIntoTerminal, isActivePanel, lifecycleRefs, viewportRefs]);

  useEffect(() => {
    const rootElement = viewportRefs?.current?.terminalRootRef?.current;
    if (!rootElement) return undefined;

    const handleMouseUp = () => {
      if (lifecycleRefs?.current?.isDisposingRef?.current) return;
      if (!autoCopy) return;
      const termRef = rendererRefs?.current?.termRef;
      const term = termRef?.current;
      if (!term) return;

      // Let xterm finalize selection from this gesture
      setTimeout(async () => {
        if (term.hasSelection()) {
          const selectedText = term.getSelection();
          if (selectedText) {
            await copyTextToClipboard(selectedText);
          }
        }
      }, 0);
    };

    rootElement.addEventListener('mouseup', handleMouseUp);
    return () => {
      rootElement.removeEventListener('mouseup', handleMouseUp);
    };
  }, [autoCopy, copyTextToClipboard, lifecycleRefs, rendererRefs, viewportRefs]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  useEffect(() => {
    const handler = async (e) => {
      const key = e.key || '';
      const ctrl = e.ctrlKey || false;
      const shift = e.shiftKey || false;
      const alt = e.altKey || false;

      const rootElement = viewportRefs?.current?.terminalRootRef?.current;
      const activeElement = document?.activeElement || null;
      const eventTarget = e.target instanceof Node ? e.target : null;
      const belongsToTerminal = terminalClipboardEventBelongsToPanel({
        rootElement,
        activeElement,
        eventTarget,
        isActivePanel,
      });

      if (alt && !ctrl && !shift && key.toLowerCase() === 'v') {
        const image = await readClipboardImage();
        if (image?.data) {
          // ponytail: only log clipboard actions, never every keystroke
          cliLog('[keydown]', 'Alt+V clipboard image detected');
          if (!belongsToTerminal) return;
          e.preventDefault();
          e.stopPropagation();
          await handlePasteIntoTerminal({ image }).catch(() => false);
          return;
        }
      }

      const action = resolveTerminalClipboardShortcut(e);

      if (action === 'copy' && shouldUseNativeRenderer) {
        if (belongsToTerminal) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (!action) return;

      cliLog('[keydown]', `action=${action} belongs=${belongsToTerminal}`);

      if (!belongsToTerminal) return;

      e.preventDefault();
      e.stopPropagation();

      if (action === 'paste') {
        cliLog('[keydown]', 'calling handlePasteIntoTerminal');
        await handlePasteIntoTerminal().catch(() => false);
      } else if (action === 'copy') {
        await handleCopySelection();
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [
    handleCopySelection,
    handlePasteIntoTerminal,
    isActivePanel,
    shouldUseNativeRenderer,
    viewportRefs,
  ]);

  return {
    copied,
    contextMenu,
    setContextMenu,
    dismissContextMenu,
    copyTextToClipboard,
    handleCopySelection,
    handlePasteIntoTerminal,
    handleContextMenu,
    handleCopyFromMenu,
    handlePasteFromMenu,
    handleViewportPaste,
  };
}
