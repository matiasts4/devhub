import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(ROOT, 'src/components/TerminalTTY.jsx'), 'utf8').split(/\r?\n/);

function extractFn(start, end) {
  const chunk = lines.slice(start - 1, end).join('\n');
  const idx = chunk.indexOf('useCallback(');
  if (idx < 0) throw new Error(`useCallback not found ${start}-${end}`);
  const after = chunk.slice(idx + 'useCallback('.length);
  const multilineClose = after.lastIndexOf('\n    },\n    [');
  const singleClose = after.lastIndexOf('\n  }, [');
  const close = Math.max(multilineClose, singleClose);
  if (close < 0) throw new Error(`deps close not found ${start}-${end}`);
  const bodyEnd =
    multilineClose >= singleClose ? multilineClose + '\n    }'.length : singleClose + '\n  }'.length;
  return after.slice(0, bodyEnd).trim();
}

function extractEffect(start, end) {
  const chunk = lines.slice(start - 1, end).join('\n');
  const idx = chunk.indexOf('useEffect(() => {');
  if (idx < 0) throw new Error(`useEffect not found ${start}-${end}`);
  return chunk.slice(idx);
}

const disposeBody = extractFn(730, 990);
const recoveryEffect = extractEffect(3680, 3695);
const bootEffect = extractEffect(3697, 4229);

const ctxDestructure = `    const c = ctxRef.current;`;

const header = `/**
 * useTerminalEngine — xterm lifecycle boot/dispose.
 * Extracted from TerminalTTY.jsx (terminal-decompose TTY-9).
 * size_exception: cohesive engine hook ~1100 lines after prior slices.
 */
/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps -- ctxRef bag */
import { useCallback, useEffect } from 'react';
import { cliLog, attachTerminalRendererAddons, neutralizeWebglAddonForDisposal, isStaleXtermRendererError, resolveColdMountStaggerMs, fitTerminalViewport, stabilizeTerminalRenderer, refreshTerminalViewport, prepareActiveTuiTerminalFocus, shouldAttachWebglRenderer, shouldAttachCanvasRenderer, shouldMountCanvasAddon, shouldRefitVisibleInactiveSplitPanel, needsGpuRendererReattach, coalescedSoftGpuVisibilityReveal, buildTerminalLifecycleEvent } from '@/components/terminal/TerminalTTY.helpers';
import { getTerminalTheme, getTerminalFontOptions } from '@/components/terminal/TerminalThemeSync';
import { resolveTerminalFontFamily } from '@/components/terminal/TerminalTTY.helpers';
import { clearPanelActivity } from '@/components/terminal/utils/panelActivityStore';
import { stashTerminalPanelBridge } from '@/lib/terminal/terminalPanelBridge';
import { hasSurface as graveyardHasSurface, restoreSurface as graveyardRestoreSurface, stashSurface as graveyardStashSurface } from '@/lib/terminal/v2Graveyard';
import { filterTerminalInputForSession } from '@/lib/terminal/terminalNoiseFilter';

export default function useTerminalEngine({ ctxRef }) {
  const disposeXtermRuntime = useCallback((${disposeBody.startsWith('(') ? disposeBody : `(${disposeBody}`}), [ctxRef]);

  ${bootEffect.replace('useEffect(() => {', `useEffect(() => {\n    ${ctxDestructure}`).replace(/}, \[/, '}, [ctxRef,')}

  return { disposeXtermRuntime, boot: () => {} };
}
`;

// Fix dispose wrap - disposeBody already is (args) => { ... }
const disposeSig = disposeBody;
const bootPatched = bootEffect
  .replace('useEffect(() => {', `useEffect(() => {\n    ${ctxDestructure}`)
  .replace(/\n  \}, \[/, '\n  }, [ctxRef,');

const full = `/**
 * useTerminalEngine — xterm lifecycle boot/dispose.
 * Extracted from TerminalTTY.jsx (terminal-decompose TTY-9).
 * size_exception: cohesive engine hook ~1100 lines after prior slices.
 */
/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps -- ctxRef bag */
import { useCallback, useEffect } from 'react';
import { cliLog, attachTerminalRendererAddons, neutralizeWebglAddonForDisposal, isStaleXtermRendererError, resolveColdMountStaggerMs, fitTerminalViewport, stabilizeTerminalRenderer, refreshTerminalViewport, prepareActiveTuiTerminalFocus, shouldAttachWebglRenderer, shouldAttachCanvasRenderer, shouldMountCanvasAddon, shouldRefitVisibleInactiveSplitPanel, needsGpuRendererReattach, coalescedSoftGpuVisibilityReveal, buildTerminalLifecycleEvent } from '@/components/terminal/TerminalTTY.helpers';
import { getTerminalTheme, getTerminalFontOptions } from '@/components/terminal/TerminalThemeSync';
import { resolveTerminalFontFamily } from '@/components/terminal/TerminalTTY.helpers';
import { clearPanelActivity } from '@/components/terminal/utils/panelActivityStore';
import { stashTerminalPanelBridge } from '@/lib/terminal/terminalPanelBridge';
import { hasSurface as graveyardHasSurface, restoreSurface as graveyardRestoreSurface, stashSurface as graveyardStashSurface } from '@/lib/terminal/v2Graveyard';
import { filterTerminalInputForSession } from '@/lib/terminal/terminalNoiseFilter';

export default function useTerminalEngine({ ctxRef }) {
  const disposeXtermRuntime = useCallback(${disposeSig}, [ctxRef]);

${bootPatched}

  return { disposeXtermRuntime };
}
`;

const out = path.join(ROOT, 'src/components/terminal/hooks/useTerminalEngine.js');
fs.writeFileSync(out, full, 'utf8');
console.log('Wrote', out, full.split('\n').length, 'lines');