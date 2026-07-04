import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(ROOT, '.tmp/tty8-source.jsx');
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

const disposeBlock = slice(730, 990);
const disposeMatch = disposeBlock.match(
  /const disposeXtermRuntime = useCallback\([\s\S]+?\n    \},\n    \[[^\]]*\]\n  \);/
);
if (!disposeMatch) throw new Error('dispose block not found');
const disposeBody = disposeMatch[0]
  .replace(/^const disposeXtermRuntime = useCallback\(/, '')
  .replace(/\n    \},\n    \[[^\]]*\]\n  \);$/, '');

const recoveryEffect = slice(3680, 3695);
const bootEffect = slice(3697, 4229);

const refKeys = new Set();
const refRe = /\b([a-zA-Z_$][\w$]*Ref)\b/g;
for (const block of [disposeBody, recoveryEffect, bootEffect]) {
  for (const m of block.matchAll(refRe)) refKeys.add(m[1]);
}

const extraKeys = [
  'id', 'cwd', 'autoFocus', 'coldMountOrdinal', 'fontSize', 'restored', 'initialCommand',
  'clearTimers', 'clearConnectDeferTimer', 'clearOutputQueue', 'setInitError', 'setIsInitializing',
  'setConnectionState', 'setWebglFallback', 'waitForVisibleDimensions', 'maybeConnectAfterViewportFit',
  'coalescedSoftGpuVisibilityReveal', 'scheduleInactiveViewportRepaint', 'logViewportDiagnostic',
  'shouldBootXterm', 'runtimePhase', 'rendererViewModel', 'effectiveRequestedMode', 'disposeXtermRuntime',
  'ENABLE_NATIVE_VTE', 'reconnect', 'hasSentInitialCommand', 'requestedRendererMode', 'xtermBootNonce',
  'stashTerminalPanelBridge', 'writeTerminalOutput',
];

const ctxKeys = [...new Set([...refKeys, ...extraKeys])]
  .filter((k) => k !== 'prevInitialCommandRef')
  .sort();
const ctxBlock = `    const {\n      ${ctxKeys.join(',\n      ')},\n    } = ctxRef.current;\n`;

const header = `/**
 * useTerminalEngine — xterm lifecycle boot/dispose.
 * Extracted from TerminalTTY.jsx (terminal-decompose TTY-9).
 */
/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps -- ctxRef bag */
import { useCallback, useEffect, useRef } from 'react';
import { cliLog, attachTerminalRendererAddons, neutralizeWebglAddonForDisposal, isStaleXtermRendererError, resolveColdMountStaggerMs, fitTerminalViewport, stabilizeTerminalRenderer, refreshTerminalViewport, prepareActiveTuiTerminalFocus, shouldAttachWebglRenderer, shouldAttachCanvasRenderer, shouldMountCanvasAddon, shouldRefitVisibleInactiveSplitPanel, needsGpuRendererReattach, coalescedSoftGpuVisibilityReveal } from '@/components/terminal/TerminalTTY.helpers';
import { buildTerminalLifecycleEvent } from '@/lib/terminal/terminalLifecycleEvent';
import { getTerminalTheme, getTerminalFontOptions } from '@/components/terminal/TerminalThemeSync';
import { resolveTerminalFontFamily } from '@/components/terminal/TerminalTTY.helpers';
import { clearPanelActivity } from '@/components/terminal/utils/panelActivityStore';
import { stashTerminalPanelBridge } from '@/lib/terminal/terminalPanelBridge';
import { hasSurface as graveyardHasSurface, restoreSurface as graveyardRestoreSurface, stashSurface as graveyardStashSurface } from '@/lib/terminal/v2Graveyard';
import { filterTerminalInputForSession } from '@/lib/terminal/terminalNoiseFilter';
import { clearPanelInitialCommandLifecycle } from '@/lib/terminal/panelInitialCommandLifecycle';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';

export default function useTerminalEngine({
  ctxRef,
  requestedRendererMode,
  runtimePhase,
  shouldBootXterm,
  xtermBootNonce,
  coldMountOrdinal,
  id,
  initialCommand,
}) {
  const prevInitialCommandRef = useRef(initialCommand);

`;

const disposeWithCtx = disposeBody.replace(
  /(\(\{ stashForV2 = false \} = \{\}\) => \{)\n/,
  `$1\n${ctxBlock}`
);
if (!disposeWithCtx.includes('} = ctxRef.current;')) {
  throw new Error('failed to inject ctx into dispose callback');
}
const disposeClosed = `${disposeWithCtx.trimEnd()}\n    }`;
const disposeWrapped = `  const disposeXtermRuntime = useCallback(\n${disposeClosed},\n  [ctxRef]);\n\n`;

let recoveryWrapped = recoveryEffect
  .replace('useEffect(() => {', `useEffect(() => {\n${ctxBlock}`)
  .replace(
    'const prevInitialCommandRef = useRef(initialCommand);\n  useEffect(() => {',
    'useEffect(() => {'
  );
recoveryWrapped = recoveryWrapped.replace(
  /  \}, \[id, initialCommand, reconnect\]\);/,
  '  }, [ctxRef, id, initialCommand]);'
);

let bootWrapped = bootEffect.replace('useEffect(() => {', `useEffect(() => {\n${ctxBlock}`);
bootWrapped = bootWrapped.replace(
  /  \}, \[\n    \/\/ NOTE: logViewportDiagnostic[\s\S]+?maybeConnectAfterViewportFit,\n  \]\);/,
  `  }, [
    disposeXtermRuntime,
    requestedRendererMode,
    runtimePhase,
    shouldBootXterm,
    xtermBootNonce,
    coldMountOrdinal,
    id,
  ]);`
);

const footer = `
  return { disposeXtermRuntime };
}
`;

const full = header + disposeWrapped + recoveryWrapped + '\n' + bootWrapped + footer;
const out = path.join(ROOT, 'src/components/terminal/hooks/useTerminalEngine.js');
fs.writeFileSync(out, full, 'utf8');
console.log('Rebuilt', out, full.split('\n').length, 'lines,', ctxKeys.length, 'ctx keys');