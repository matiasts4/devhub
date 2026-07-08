import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const body = fs
  .readFileSync(path.join(ROOT, '.tmp/connect-block.txt'), 'utf8')
  .replace(/^  const connect = useCallback\(async \(\) => \{\n/, '')
  .replace(/\n  \}, \[[\s\S]*$/m, '');

const ctxKeys = [
  'id',
  'cwd',
  'initialCommand',
  'restored',
  'swarmContext',
  'autoFocus',
  'connectInFlightRef',
  'sessionClosingRef',
  'wsRef',
  'transportRef',
  'connectEpochRef',
  'connectAbortRef',
  'hasConnectedOnceRef',
  'initialCommandDelayScheduledRef',
  'sessionReattachedRef',
  'serverReadyReceivedRef',
  'hasSentInitialCommand',
  'processExitedRef',
  'isEngineV2Ref',
  'isDisposingRef',
  'termRef',
  'serializeAddonRef',
  'rehydrationRef',
  'dataProcessedSinceSnapshotRef',
  'snapshotIntervalRef',
  'currentPtyOffsetRef',
  'serverTermsizeRef',
  'panelActivityTrackerRef',
  'hiddenOutputBufferRef',
  'hiddenOutputCatchupPendingRef',
  'tuiOutputTailRef',
  'tuiSessionActiveRef',
  'kimiReadyNotifiedRef',
  'isGrokSessionRef',
  'grokTuiReadyRef',
  'tuiSessionFooterConfirmedRef',
  'initialCommandConnectSnapshotRef',
  'setConnectionState',
  'setHasConnectedOnce',
  'setRestoredToast',
  'setNativeWheelPassthrough',
  'clearConnectDeferTimer',
  'sendResize',
  'writeTerminalOutput',
  'scrollIfActivePanel',
  'sendInitialCommandIfReady',
  'applyTerminalSessionExit',
  'notifyAgentReady',
  'notifyOpencodeReady',
  'onFlushWriteRef',
  'sendResizeRef',
];

const destructure = `    const {\n      ${ctxKeys.join(',\n      ')},\n    } = ctxRef.current;\n`;

const header = `/**
 * useTerminalV2Session — WS connect, subscribe, frame decode, rehydration.
 * Extracted from TerminalTTY.jsx (terminal-decompose TTY-6).
 */
import { useCallback } from 'react';
import { cliLog, prepareActiveTuiTerminalFocus, resetTerminalModesForReattach, disableTerminalFocusReporting } from '@/components/terminal/TerminalTTY.helpers';
import {
  resolveConnectInitialCommandState,
  resolveTerminalConnectionCloseState,
  TERMINAL_SNAPSHOT_THRESHOLD_BYTES,
  TERMINAL_SNAPSHOT_MAX_INTERVAL_MS,
} from '@/components/terminal/TerminalTTY.helpers';
import {
  clearPanelInitialCommandLifecycle,
  markPanelInitialCommandDispatched,
} from '@/lib/terminal/panelInitialCommandLifecycle';
import { createPanelActivityTracker } from '@/components/terminal/utils/panelActivityTracker';
import { detectOpenCodeTuiReady } from '@/lib/terminal/opencodeReadyMarker';
import { detectKimiTuiReady, isKimiLaunchCommand } from '@/lib/terminal/kimiReadyMarker';
import { detectGrokSessionFromOutput } from '@/components/terminal/TerminalTTY.helpers';

export default function useTerminalV2Session({ ctxRef }) {
  const stopV2Session = useCallback(() => {
    const { connectAbortRef, wsRef, connectInFlightRef } = ctxRef.current;
    if (connectAbortRef?.current) {
      connectAbortRef.current.abort();
      connectAbortRef.current = null;
    }
    const ws = wsRef?.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    if (connectInFlightRef) connectInFlightRef.current = false;
  }, [ctxRef]);

  const startV2Session = useCallback(async () => {
${destructure}${body}
  }, [ctxRef]);

  return { connect: startV2Session, startV2Session, stopV2Session };
}
`;

const out = path.join(ROOT, 'src/components/terminal/hooks/useTerminalV2Session.js');
fs.writeFileSync(out, header, 'utf8');
console.log('Wrote', out, header.split('\n').length, 'lines');