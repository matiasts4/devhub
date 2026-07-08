import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(ROOT, 'src/components/TerminalTTY.jsx'), 'utf8').split(/\r?\n/);

function extractFn(start, end) {
  const chunk = lines.slice(start - 1, end).join('\n');
  const idx = chunk.indexOf('useCallback(');
  if (idx < 0) throw new Error(`useCallback not found in block ${start}-${end}`);
  const after = chunk.slice(idx + 'useCallback('.length);
  const multilineClose = after.lastIndexOf('\n    },\n    [');
  const singleClose = after.lastIndexOf('\n  }, [');
  const close = Math.max(multilineClose, singleClose);
  if (close < 0) throw new Error(`deps close not found in block ${start}-${end}`);
  const bodyEnd =
    multilineClose >= singleClose ? multilineClose + '\n    }'.length : singleClose + '\n  }'.length;
  return after.slice(0, bodyEnd).trim();
}

const fns = {
  disposeWebglAddonForContextLoss: extractFn(1972, 1993),
  releaseCanvasAddon: extractFn(2108, 2127),
  tryReattachCanvasAddon: extractFn(2157, 2219),
  tryReattachWebglAddon: extractFn(2220, 2306),
  scheduleWebglRecovery: extractFn(2307, 2327),
  handleWebglContextLoss: extractFn(2328, 2375),
};

const ctxDestructure = `    const {
      id,
      initialCommand,
      termRef,
      fitRef,
      containerRef,
      wsRef,
      webglAddonRef,
      canvasAddonRef,
      webglFallbackRef,
      pendingWebglRecoveryRef,
      webglReleasedOnLayoutHideRef,
      canvasReleasedOnLayoutHideRef,
      webglRecoveryTimerRef,
      isEngineV2Ref,
      isVisibleInLayoutRef,
      isActivePanelRef,
      operationalRendererModeRef,
      visibleTerminalPanelCountRef,
      lastPtySizeRef,
      tuiSessionActiveRef,
      kimiReadyNotifiedRef,
      hasConnectedOnceRef,
      handleWebglContextLossRef,
      setWebglFallback,
      buildViewportSnapshot,
      scheduleInactiveViewportRepaint,
      scheduleBoundedGpuRecoverRef,
      scheduleBoundedFitRepaintRef,
      scheduleWorkspaceShowRecoveryRef,
    } = ctxRef.current;`;

function wrap(name, sigBody) {
  return `  const ${name} = useCallback(${sigBody}, [ctxRef]);`;
}

const header = `/**
 * useTerminalRendererController — WebGL/Canvas attach, reattach, context-loss.
 * Extracted from TerminalTTY.jsx (terminal-decompose TTY-7).
 */
import { useCallback, useEffect } from 'react';
import { cliLog } from '@/components/terminal/TerminalTTY.helpers';
import {
  neutralizeWebglAddonForDisposal,
  stabilizeTerminalRenderer,
  isTerminalRendererReady,
  fitTerminalViewport,
  proposeTerminalViewportDimensions,
  shouldAttachWebglRenderer,
  shouldAttachCanvasRenderer,
  shouldMountCanvasAddon,
  shouldBlockV2WebglRecovery,
  shouldSkipKimiTuiPtyResize,
  TERMINAL_WEBGL_FALLBACK_REASONS,
  WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON,
} from '@/components/terminal/TerminalTTY.helpers';

export default function useTerminalRendererController({ ctxRef }) {
`;

let body = '';
for (const [name, sigBody] of Object.entries(fns)) {
  const arrowIdx = sigBody.indexOf('=>');
  const braceIdx = sigBody.indexOf('{', arrowIdx);
  const injected =
    sigBody.slice(0, braceIdx + 1) + '\n' + ctxDestructure + sigBody.slice(braceIdx + 1);
  body += wrap(name, injected) + '\n\n';
}

const footer = `
  useEffect(() => {
    const ref = ctxRef.current?.handleWebglContextLossRef;
    if (ref) ref.current = handleWebglContextLoss;
  }, [ctxRef, handleWebglContextLoss]);

  return {
    disposeWebglAddonForContextLoss,
    tryReattachWebglAddon,
    tryReattachCanvasAddon,
    releaseCanvasAddon,
    scheduleWebglRecovery,
    handleWebglContextLoss,
    attachRenderer: tryReattachWebglAddon,
    detachRenderer: releaseCanvasAddon,
    handleContextLoss: handleWebglContextLoss,
  };
}
`;

const out = path.join(ROOT, 'src/components/terminal/hooks/useTerminalRendererController.js');
const full = header + body + footer;
fs.writeFileSync(out, full, 'utf8');
console.log('Wrote', out, full.split('\n').length, 'lines');