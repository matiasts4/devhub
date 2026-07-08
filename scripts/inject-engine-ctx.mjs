import fs from 'fs';

const path = 'src/components/terminal/hooks/useTerminalEngine.js';
let src = fs.readFileSync(path, 'utf8');

const extra = [
  'id', 'cwd', 'autoFocus', 'coldMountOrdinal', 'fontSize', 'restored', 'initialCommand',
  'clearTimers', 'clearConnectDeferTimer', 'clearOutputQueue', 'setInitError', 'setIsInitializing',
  'setConnectionState', 'setWebglFallback',
  'waitForVisibleDimensions', 'maybeConnectAfterViewportFit', 'coalescedSoftGpuVisibilityReveal',
  'scheduleInactiveViewportRepaint', 'logViewportDiagnostic', 'shouldBootXterm', 'runtimePhase',
  'ENABLE_NATIVE_VTE', 'rendererViewModel', 'effectiveRequestedMode', 'disposeXtermRuntime',
];

const refMatches = [...src.matchAll(/\b([a-zA-Z_$][\w$]*Ref)\b/g)].map((m) => m[1]);
const keys = [...new Set([...refMatches, ...extra])].sort();

const block = `    const {\n      ${keys.join(',\n      ')},\n    } = ctxRef.current;\n`;

src = src.replace(
  'const disposeXtermRuntime = useCallback(({ stashForV2 = false } = {}) => {\n',
  `const disposeXtermRuntime = useCallback(({ stashForV2 = false } = {}) => {\n${block}`
);

src = src.replace(
  'useEffect(() => {\n    const c = ctxRef.current;',
  `useEffect(() => {\n${block}`
);

if (!src.includes('const c = ctxRef.current')) {
  src = src.replace('useEffect(() => {\n', `useEffect(() => {\n${block}`);
}

fs.writeFileSync(path, src, 'utf8');
console.log('Injected', keys.length, 'ctx keys into useTerminalEngine.js');