/**
 * Extract TTY hook slices from TerminalTTY.jsx (behavior-preserving line moves).
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TTY = path.join(ROOT, 'src/components/TerminalTTY.jsx');

function readLines() {
  return fs.readFileSync(TTY, 'utf8').split(/\r?\n/);
}

function slice(lines, start, end) {
  return lines.slice(start - 1, end).join('\n');
}

function writeHook(relPath, header, body, footer = '') {
  const full = `${header}\n${body}\n${footer}`;
  const out = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, full, 'utf8');
  console.log(`Wrote ${relPath} (${full.split('\n').length} lines)`);
}

const lines = readLines();

// TTY-6: connect callback body (inside useCallback)
const connectHeader = `/**
 * useTerminalV2Session — WS connect, subscribe, frame decode, rehydration.
 * Extracted from TerminalTTY.jsx.
 */
import { useCallback } from 'react';
import { cliLog } from '@/components/terminal/TerminalTTY.helpers';
import {
  resolveConnectInitialCommandState,
  resolveTerminalConnectionCloseState,
  resetTerminalModesForReattach,
  disableTerminalFocusReporting,
  TERMINAL_SNAPSHOT_THRESHOLD_BYTES,
  TERMINAL_SNAPSHOT_MAX_INTERVAL_MS,
} from '@/components/terminal/TerminalTTY.helpers';
import {
  clearPanelInitialCommandLifecycle,
  markPanelInitialCommandDispatched,
} from '@/lib/terminal/panelInitialCommandLifecycle';
import { createPanelActivityTracker } from '@/components/terminal/utils/panelActivityTracker';
import {
  detectOpenCodeTuiReady,
  detectGrokSessionFromOutput,
} from '@/lib/terminal/opencodeReadyMarker';
import {
  detectKimiTuiReady,
  isKimiLaunchCommand,
} from '@/lib/terminal/kimiReadyMarker';
import { detectGrokTuiReady } from '@/components/terminal/TerminalTTY.helpers';
import { prepareActiveTuiTerminalFocus } from '@/components/terminal/TerminalTTY.helpers';

function readRef(bag, key) {
  return bag?.current?.[key]?.current;
}

function writeRef(bag, key, value) {
  if (bag?.current?.[key]) bag.current[key].current = value;
}

export default function useTerminalV2Session({
  sessionRefs,
  rendererRefs,
  lifecycleRefs,
  outputRefs,
  panelId,
  cwd,
  initialCommand,
  restored,
  swarmContext,
  setConnectionState,
  setHasConnectedOnce,
  setRestoredToast,
  setNativeWheelPassthrough,
  writeTerminalOutput,
  scrollIfActivePanel,
  sendInitialCommandIfReady,
  applyTerminalSessionExit,
  notifyAgentReady,
  notifyOpencodeReady,
  clearConnectDeferTimer,
  scheduleInactiveViewportRepaint,
  sendResizeRef,
  onFlushWriteRef,
  hasSentInitialCommandRef,
}) {
  const stopV2Session = useCallback(() => {
    const abort = readRef(sessionRefs, 'connectAbortRef');
    if (abort) abort.abort();
    writeRef(sessionRefs, 'connectAbortRef', null);
    const ws = readRef(sessionRefs, 'wsRef');
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
      writeRef(sessionRefs, 'wsRef', null);
    }
    writeRef(sessionRefs, 'connectInFlightRef', false);
  }, [sessionRefs]);

  const startV2Session = useCallback(async () => {`;

const connectBody = slice(lines, 4275, 4815)
  .replace(/^  const connect = useCallback\(async \(\) => \{\n/, '')
  .replace(/^\s{2}\}, \[$/, '  }, [')
  .replace(/^    /gm, '    ');

const connectFooter = `  }, [
    applyTerminalSessionExit,
    initialCommand,
    scheduleInactiveViewportRepaint,
    scrollIfActivePanel,
    sendInitialCommandIfReady,
    cwd,
    panelId,
    sessionRefs,
    rendererRefs,
    lifecycleRefs,
    outputRefs,
    restored,
    swarmContext,
    setConnectionState,
    setHasConnectedOnce,
    setRestoredToast,
    setNativeWheelPassthrough,
    writeTerminalOutput,
    notifyAgentReady,
    notifyOpencodeReady,
    clearConnectDeferTimer,
    sendResizeRef,
    onFlushWriteRef,
    hasSentInitialCommandRef,
  ]);

  return { connect: startV2Session, startV2Session, stopV2Session };
}
`;

writeHook('src/components/terminal/hooks/useTerminalV2Session.js', connectHeader, connectBody, connectFooter);

console.log('Done. Review generated files before patching TerminalTTY.jsx.');