/**
 * useTerminalOutputQueue — output backlog, RAF flush, per-frame cap, DEC 2026 sync output.
 * Extracted from TerminalTTY.jsx.
 */

import { useCallback, useRef } from 'react';
import { cliLog } from '@/components/terminal/TerminalTTY.helpers';
import {
  TERMINAL_SYNC_OUTPUT_START_SEQ,
  TERMINAL_SYNC_OUTPUT_END_SEQ,
  TERMINAL_SYNC_OUTPUT_MAX_HOLD_MS,
  TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME,
  TERMINAL_OUTPUT_BACKLOG_THRESHOLD,
} from '@/components/terminal/TerminalTTY.helpers';
import {
  containsTerminalResponseNoise,
  filterTerminalOutputForSession,
} from '@/lib/terminal/terminalNoiseFilter';
import {
  shouldSkipTerminalOutputWhileLayoutHidden,
  appendHiddenTerminalOutputBuffer,
} from '@/components/terminal/TerminalTTY.helpers';

/** @returns {import('react').MutableRefObject<object>} */
export function createOutputRefsBag() {
  return {
    current: {
      outputPendingRef: { current: { value: '' } },
      hiddenOutputBufferRef: { current: { value: '' } },
      hiddenOutputCatchupPendingRef: { current: false },
      terminalOutputQueueRef: { current: [] },
      terminalOutputFlushRafRef: { current: null },
      syncOutputActiveRef: { current: false },
      syncOutputBufferRef: { current: '' },
      syncOutputTimeoutRef: { current: null },
    },
  };
}

function readBagField(bag, key) {
  return bag?.current?.[key]?.current;
}

function writeBagField(bag, key, value) {
  if (bag?.current?.[key]) {
    bag.current[key].current = value;
  }
}

export default function useTerminalOutputQueue({
  outputRefs,
  lifecycleRefs,
  rendererRefs,
  panelId,
  onFlushWriteRef,
  isActivePanelRef,
  isVisibleInLayoutRef,
  operationalRendererModeRef,
}) {
  const panelIdRef = useRef(panelId);
  panelIdRef.current = panelId;

  const clearSyncOutputTimeout = useCallback(() => {
    const timeoutRef = readBagField(outputRefs, 'syncOutputTimeoutRef');
    if (timeoutRef) {
      clearTimeout(timeoutRef);
      writeBagField(outputRefs, 'syncOutputTimeoutRef', null);
    }
  }, [outputRefs]);

  const clearOutputQueue = useCallback(() => {
    writeBagField(outputRefs, 'terminalOutputQueueRef', []);
    writeBagField(outputRefs, 'syncOutputBufferRef', '');
    writeBagField(outputRefs, 'syncOutputActiveRef', false);
    const flushRaf = readBagField(outputRefs, 'terminalOutputFlushRafRef');
    if (flushRaf) {
      cancelAnimationFrame(flushRaf);
      writeBagField(outputRefs, 'terminalOutputFlushRafRef', null);
    }
    clearSyncOutputTimeout();
  }, [clearSyncOutputTimeout, outputRefs]);

  const flushOutput = useCallback(() => {
    writeBagField(outputRefs, 'terminalOutputFlushRafRef', null);

    const isDisposing = lifecycleRefs?.current?.isDisposingRef?.current;
    if (isDisposing) {
      writeBagField(outputRefs, 'terminalOutputQueueRef', []);
      writeBagField(outputRefs, 'syncOutputBufferRef', '');
      writeBagField(outputRefs, 'syncOutputActiveRef', false);
      clearSyncOutputTimeout();
      return;
    }

    const queue = readBagField(outputRefs, 'terminalOutputQueueRef') || [];
    let combined = queue.join('');
    writeBagField(outputRefs, 'terminalOutputQueueRef', []);

    const syncBuffer = readBagField(outputRefs, 'syncOutputBufferRef') || '';
    const pendingBytes = combined.length + syncBuffer.length;
    if (pendingBytes > TERMINAL_OUTPUT_BACKLOG_THRESHOLD) {
      cliLog(`RENDER:${panelIdRef.current}`, 'output-throttle-backlog', {
        pendingBytes,
        droppedBytes: Math.max(0, pendingBytes - TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME),
        isActivePanel: isActivePanelRef?.current,
      });
      combined = combined.slice(-TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME);
      writeBagField(outputRefs, 'syncOutputBufferRef', '');
      writeBagField(outputRefs, 'syncOutputActiveRef', false);
      clearSyncOutputTimeout();
    }

    if (!combined) return;

    const onWrite = onFlushWriteRef?.current;
    const syncActive = readBagField(outputRefs, 'syncOutputActiveRef');

    if (syncActive) {
      const nextBuffer = syncBuffer + combined;
      writeBagField(outputRefs, 'syncOutputBufferRef', nextBuffer);
      if (nextBuffer.includes(TERMINAL_SYNC_OUTPUT_END_SEQ)) {
        clearSyncOutputTimeout();
        writeBagField(outputRefs, 'syncOutputBufferRef', '');
        writeBagField(outputRefs, 'syncOutputActiveRef', false);
        onWrite?.(nextBuffer);
      }
      return;
    }

    const startIdx = combined.indexOf(TERMINAL_SYNC_OUTPUT_START_SEQ);
    if (startIdx !== -1) {
      const before = combined.slice(0, startIdx);
      if (before) {
        onWrite?.(before);
      }
      writeBagField(outputRefs, 'syncOutputActiveRef', true);
      const syncChunk = combined.slice(startIdx);
      writeBagField(outputRefs, 'syncOutputBufferRef', syncChunk);
      if (syncChunk.includes(TERMINAL_SYNC_OUTPUT_END_SEQ)) {
        clearSyncOutputTimeout();
        writeBagField(outputRefs, 'syncOutputBufferRef', '');
        writeBagField(outputRefs, 'syncOutputActiveRef', false);
        onWrite?.(syncChunk);
      } else {
        const timeoutRef = setTimeout(() => {
          if (!readBagField(outputRefs, 'syncOutputActiveRef')) return;
          const forced = readBagField(outputRefs, 'syncOutputBufferRef') || '';
          writeBagField(outputRefs, 'syncOutputBufferRef', '');
          writeBagField(outputRefs, 'syncOutputActiveRef', false);
          if (forced && !lifecycleRefs?.current?.isDisposingRef?.current) {
            onWrite?.(forced);
          }
        }, TERMINAL_SYNC_OUTPUT_MAX_HOLD_MS);
        writeBagField(outputRefs, 'syncOutputTimeoutRef', timeoutRef);
      }
      return;
    }

    if (combined.length > TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME) {
      const now = combined.slice(0, TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME);
      const rest = combined.slice(TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME);
      const queueRef = readBagField(outputRefs, 'terminalOutputQueueRef') || [];
      queueRef.unshift(rest);
      writeBagField(outputRefs, 'terminalOutputQueueRef', queueRef);
      combined = now;
      const flushRaf = readBagField(outputRefs, 'terminalOutputFlushRafRef');
      if (!flushRaf) {
        const rafId = requestAnimationFrame(flushOutput);
        writeBagField(outputRefs, 'terminalOutputFlushRafRef', rafId);
      }
    }

    onWrite?.(combined);
  }, [clearSyncOutputTimeout, isActivePanelRef, lifecycleRefs, onFlushWriteRef, outputRefs]);

  const enqueueOutput = useCallback(
    (chunk) => {
      const queue = readBagField(outputRefs, 'terminalOutputQueueRef') || [];
      queue.push(chunk);
      writeBagField(outputRefs, 'terminalOutputQueueRef', queue);
      const flushRaf = readBagField(outputRefs, 'terminalOutputFlushRafRef');
      if (!flushRaf) {
        const rafId = requestAnimationFrame(flushOutput);
        writeBagField(outputRefs, 'terminalOutputFlushRafRef', rafId);
      }
    },
    [flushOutput, outputRefs]
  );

  const writeTerminalOutput = useCallback(
    (chunk) => {
      if (containsTerminalResponseNoise(chunk)) {
        cliLog(`RENDER:${panelIdRef.current}`, 'output-noise-filtered', {
          bytes: chunk.length,
          isActivePanel: isActivePanelRef?.current,
          webglAttached: Boolean(rendererRefs?.current?.webglAddonRef?.current),
        });
      }
      const outputPendingRef = readBagField(outputRefs, 'outputPendingRef');
      const filtered = filterTerminalOutputForSession(null, chunk, outputPendingRef);
      const canvasAttached = Boolean(rendererRefs?.current?.canvasAddonRef?.current);

      if (
        shouldSkipTerminalOutputWhileLayoutHidden({
          isVisibleInLayout: isVisibleInLayoutRef?.current,
          isActivePanel: isActivePanelRef?.current,
          operationalRendererMode: operationalRendererModeRef?.current,
          canvasAttached,
        })
      ) {
        if (typeof filtered === 'string' && filtered.length > 0) {
          const hiddenBuffer = readBagField(outputRefs, 'hiddenOutputBufferRef');
          appendHiddenTerminalOutputBuffer(hiddenBuffer, filtered);
          writeBagField(outputRefs, 'hiddenOutputCatchupPendingRef', true);
        }
        return;
      }
      if (typeof filtered !== 'string' || filtered.length === 0) return;

      if (readBagField(outputRefs, 'hiddenOutputCatchupPendingRef')) {
        const hiddenBuffer = readBagField(outputRefs, 'hiddenOutputBufferRef');
        appendHiddenTerminalOutputBuffer(hiddenBuffer, filtered);
        return;
      }

      enqueueOutput(filtered);
    },
    [
      enqueueOutput,
      isActivePanelRef,
      isVisibleInLayoutRef,
      operationalRendererModeRef,
      outputRefs,
      rendererRefs,
    ]
  );

  return {
    enqueueOutput,
    flushOutput,
    clearOutputQueue,
    clearSyncOutputTimeout,
    writeTerminalOutput,
  };
}
