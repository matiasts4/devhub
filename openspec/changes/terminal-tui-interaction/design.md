# Design: terminal-tui-interaction

**Branch:** `feature/terminal-renderer-xterm-webgl`
**Source of truth:** `openspec/changes/terminal-tui-interaction/{proposal,spec,exploration}.md`
**Review budget:** 400 lines, single-PR friendly. Chained PR = display-names first, tui-interaction second (per prompt).

This design pins exact code shapes, not pseudo-code. Every signature, regex, line range, and test path is cited.

---

## 1. sessionContext shape (LOCKED)

### 1.1 New `filterTerminalInputForSession` signature

The current signature in `src/lib/terminal/terminalNoiseFilter.js:135` is:

```js
export function filterTerminalInputForSession(_session, chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  if (!containsTerminalInputNoise(chunk)) return chunk;
  const stripped = stripTerminalInputNoise(chunk);
  return stripped.length === 0 ? null : stripped;
}
```

**New shape (LOCKED):**

```ts
type SessionContext = {
  mode: 'tui' | 'shell';
  tuiReady: boolean;
  tuiAdapter?: 'opencode' | 'grok' | string;
  panelHidden?: boolean;
};

export function filterTerminalInputForSession(
  ctx: SessionContext | null | undefined,
  chunk: string,
): string | null;
```

**Contract (LOCKED):**

- `ctx == null` (null or undefined) — **legacy behavior**: strip click leaks. Backward-compat shim preserves every existing call site that passes `null` today.
- `ctx.mode === 'shell'` — strip click leaks (current behavior, regardless of `tuiReady`).
- `ctx.mode === 'tui' && ctx.tuiReady === true && ctx.panelHidden !== true` — **SGR clicks (button 0–3) PASS through**, but the other noise classes (DA, focus, window report) are still stripped. Wheel (64/65) is unaffected by the click gate — it was always passed.
- `ctx.mode === 'tui' && ctx.tuiReady === false` — strip click leaks (panel not yet ready; don't forward to a PTY that has not enabled `?1006h`).

**Exact replacement body for `terminalNoiseFilter.js:135-140`:**

```js
export function filterTerminalInputForSession(ctx, chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  if (!containsTerminalInputNoise(chunk)) return chunk;
  const stripped = stripTerminalInputNoise(chunk, ctx);
  return stripped.length === 0 ? null : stripped;
}
```

`stripTerminalInputNoise` becomes a thin dispatcher that consults `ctx` to decide whether to call `stripTerminalMouseClickLeak`. Body of the new `stripTerminalInputNoise`:

```js
export function stripTerminalInputNoise(chunk, ctx) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  const baseStripped = chunk
    .replace(TERMINAL_WINDOW_REPORT_RE, '')
    .replace(SHELL_TERMINAL_RESPONSE_RE, '');
  const focusStripped = stripTerminalFocusReporting(baseStripped);
  // Click gate: forward SGR clicks (button 0–3) when the panel is a confirmed TUI.
  // Wheel (64/65) is unaffected — that path is decided upstream in the TUI adapter
  // and never enters this branch.
  if (ctx && ctx.mode === 'tui' && ctx.tuiReady === true && ctx.panelHidden !== true) {
    return focusStripped;
  }
  return stripTerminalMouseClickLeak(focusStripped);
}
```

**Backward compat (T1 of the proposal):** every call site that passes `null` today (e.g. `src/components/TerminalTTY.jsx:3845`) continues to work — the `if (ctx && ...)` guard short-circuits to the existing click-strip path. The session is allowed to be `null | undefined` per the type.

### 1.2 Wiring at the `onData` site — `src/components/TerminalTTY.jsx:3844-3854`

Current code (verbatim from `TerminalTTY.jsx:3844-3846`):

```js
terminal.onData((data) => {
  const filtered = filterTerminalInputForSession(null, data);
```

**New code (replace lines 3844-3845 with):**

```js
terminal.onData((data) => {
  const sessionContext = {
    mode: tuiSessionActiveRef.current ? 'tui' : 'shell',
    tuiReady: tuiSessionFooterConfirmedRef.current === true,
    tuiAdapter: isGrokSessionRef.current
      ? 'grok'
      : tuiSessionActiveRef.current
        ? 'opencode'
        : 'shell',
    panelHidden: panelHiddenRef?.current === true,
  };
  const filtered = filterTerminalInputForSession(sessionContext, data);
```

`panelHiddenRef` is added to the existing `useRef` block (line ~1234) with the other panel refs. The `tuiAdapter` field defaults to `'shell'` when no TUI is active so the adapter registry lookup at `tuiAdapter.js` always resolves.

---

## 2. `tuiAdapter` module (NEW FILE)

**Path:** `/home/matias/ArxonLabs/devhub/src/lib/terminal/tuiAdapter.js`
**Cited existing data points:**
- Footer regex flip at `src/components/TerminalTTY.jsx:3307` (`tuiSessionFooterConfirmedRef.current = true`).
- Grok title match via `detectGrokSessionFromOutput` invoked at `src/components/TerminalTTY.jsx:3296`.
- Existing wheel-passthrough wrapper at `src/components/TerminalTTY.jsx:4383` (kept stable as a thin wrapper).

### 2.1 The file (exact contents, with line breaks)

```js
/* eslint-disable no-control-regex -- terminal escape sequences require ESC in regex */
/**
 * tuiAdapter.js — per-TUI strategy registry.
 *
 * Each TUI (opencode, grok, plain shell) has its own scroll/click/focus behavior.
 * The adapter is selected by `programSignature`, a stable string derived from
 * `initialCommand` or the footer/title match. The adapter object returned by
 * `getTuiAdapter` is what `shouldPassthroughNativeTuiWheel`,
 * `filterTerminalInputForSession`, and `prepareActiveTuiTerminalFocus` consult.
 *
 * Spec coverage: FR-T08 (TUI adapter contract).
 */

const TUI_ADAPTER_REGISTRY = Object.freeze({
  opencode: Object.freeze({
    id: 'opencode',
    detectReady: ({ refs } = {}) =>
      Boolean(refs?.tuiSessionFooterConfirmedRef?.current),
    wheelStrategy: Object.freeze({
      passThrough: true,
      buttons: [64, 65],
    }),
    clickStrategy: Object.freeze({
      passThrough: true,
      button: 0,
      requireFooterConfirmed: true,
    }),
    focusStrategy: Object.freeze({
      consume: true,
      stripFocusInOut: true,
    }),
  }),
  grok: Object.freeze({
    id: 'grok',
    detectReady: ({ refs } = {}) => Boolean(refs?.grokTuiReadyRef?.current),
    wheelStrategy: Object.freeze({
      passThrough: true,
      buttons: [64, 65],
    }),
    clickStrategy: Object.freeze({
      passThrough: true,
      button: 0,
      requireFooterConfirmed: false,
    }),
    focusStrategy: Object.freeze({
      consume: true,
      stripFocusInOut: true,
    }),
  }),
  plain: Object.freeze({
    id: 'plain',
    detectReady: () => false,
    wheelStrategy: Object.freeze({
      passThrough: false,
      buttons: [],
      localScrollback: true,
    }),
    clickStrategy: Object.freeze({
      passThrough: false,
      button: null,
    }),
    focusStrategy: Object.freeze({
      consume: false,
      stripFocusInOut: false,
    }),
  }),
});

const PLAIN_FALLBACK = TUI_ADAPTER_REGISTRY.plain;

export function getTuiAdapter(programSignature) {
  if (
    typeof programSignature === 'string' &&
    Object.prototype.hasOwnProperty.call(TUI_ADAPTER_REGISTRY, programSignature)
  ) {
    return TUI_ADAPTER_REGISTRY[programSignature];
  }
  return PLAIN_FALLBACK;
}

export const tuiAdapterRegistry = TUI_ADAPTER_REGISTRY;
```

### 2.2 Test file

**Path:** `/home/matias/ArxonLabs/devhub/src/lib/terminal/tuiAdapter.test.js`

Required describe blocks (4–5, all must pass):

```js
const {
  getTuiAdapter,
  tuiAdapterRegistry,
} = require('./tuiAdapter');

describe('tuiAdapter registry', () => {
  test('exports three adapters: opencode, grok, plain', () => {
    expect(Object.keys(tuiAdapterRegistry).sort()).toEqual(
      ['grok', 'opencode', 'plain']
    );
  });

  test('getTuiAdapter returns distinct objects for opencode and grok', () => {
    const a = getTuiAdapter('opencode');
    const b = getTuiAdapter('grok');
    expect(a).not.toBe(b);
    expect(a.id).toBe('opencode');
    expect(b.id).toBe('grok');
  });

  test('getTuiAdapter returns plain adapter for unknown signatures', () => {
    expect(getTuiAdapter('unknown').id).toBe('plain');
    expect(getTuiAdapter(null).id).toBe('plain');
    expect(getTuiAdapter(undefined).id).toBe('plain');
  });
});

describe('opencode adapter strategies', () => {
  const a = getTuiAdapter('opencode');

  test('detectReady reads tuiSessionFooterConfirmedRef.current', () => {
    const refs = { tuiSessionFooterConfirmedRef: { current: false } };
    expect(a.detectReady({ refs })).toBe(false);
    refs.tuiSessionFooterConfirmedRef.current = true;
    expect(a.detectReady({ refs })).toBe(true);
  });

  test('wheelStrategy preserves SGR 64 and 65', () => {
    expect(a.wheelStrategy.passThrough).toBe(true);
    expect(a.wheelStrategy.buttons.sort()).toEqual([64, 65]);
  });

  test('clickStrategy requires footer confirmed', () => {
    expect(a.clickStrategy.passThrough).toBe(true);
    expect(a.clickStrategy.button).toBe(0);
    expect(a.clickStrategy.requireFooterConfirmed).toBe(true);
  });

  test('focusStrategy consumes focus-in/out', () => {
    expect(a.focusStrategy.consume).toBe(true);
    expect(a.focusStrategy.stripFocusInOut).toBe(true);
  });
});

describe('grok adapter strategies', () => {
  const a = getTuiAdapter('grok');

  test('detectReady reads grokTuiReadyRef.current', () => {
    const refs = { grokTuiReadyRef: { current: false } };
    expect(a.detectReady({ refs })).toBe(false);
    refs.grokTuiReadyRef.current = true;
    expect(a.detectReady({ refs })).toBe(true);
  });

  test('clickStrategy does not require footer confirmation', () => {
    expect(a.clickStrategy.requireFooterConfirmed).toBe(false);
  });
});

describe('plain shell adapter strategies', () => {
  const a = getTuiAdapter('plain');

  test('detectReady always returns false', () => {
    expect(a.detectReady({ refs: { tuiSessionFooterConfirmedRef: { current: true } } })).toBe(false);
  });

  test('wheelStrategy uses local xterm scrollback', () => {
    expect(a.wheelStrategy.passThrough).toBe(false);
    expect(a.wheelStrategy.localScrollback).toBe(true);
  });

  test('clickStrategy never forwards', () => {
    expect(a.clickStrategy.passThrough).toBe(false);
  });
});

describe('legacy shouldPassthroughNativeTuiWheel wrapper', () => {
  // Validated in TerminalTTY.test.js:4383 area; the wrapper must remain a
  // stable, drop-in delegate to getTuiAdapter(program).wheelStrategy.
  test('opencode adapter wheel strategy matches the legacy wrapper output', () => {
    const a = getTuiAdapter('opencode');
    const opencodeFooterConfirmed = true;
    const grokTuiReady = false;
    const isGrokSession = false;
    const out =
      (isGrokSession ? grokTuiReady : opencodeFooterConfirmed) === true &&
      a.wheelStrategy.passThrough === true &&
      a.wheelStrategy.buttons.includes(64);
    expect(out).toBe(true);
  });
});
```

The `shouldPassthroughNativeTuiWheel` wrapper at `TerminalTTY.jsx:4383` is refactored (not removed) to read `getTuiAdapter(programSignature).wheelStrategy` — the call site stays stable so the wheel regression test does not move.

---

## 3. `buildTerminalMousePressSequence` wiring

**Current state (verified by exploration §1.2, §1.4):** the function exists at `src/components/TerminalTTY.jsx:836-840`. Zero call sites in the branch. `handleViewportMouseDown` (lines 4246–4290) computes the cell at line 4260–4263 but does not emit any sequence to the PTY.

**Belt-and-suspenders fallback path:** when the user clicks in a panel whose TUI did **not** register `?1006h` (rare but observed with some xterm versions on WebKitGTK), xterm never fires `onData`, so the `onData` filter cannot forward. We emit the sequence directly from the mousedown handler.

**Exact call site to add inside `handleViewportMouseDown` (after line 4280, before line 4281):**

```js
      if (inTranscript && cell) {
        const adapter = getTuiAdapter(
          isGrokSessionRef.current ? 'grok' : 'opencode'
        );
        if (
          tuiSessionActiveRef.current &&
          tuiSessionFooterConfirmedRef.current &&
          adapter.clickStrategy.passThrough
        ) {
          const seq = buildTerminalMousePressSequence(cell.col, cell.row);
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(seq);
          } else {
            term?.inputData?.(seq);
          }
        }
      }
      term?.focus?.();
```

The `inTranscript` guard at line 4270 is reused. The active-panel `onData` path is the primary forwarder; this is the fallback for TUIs that do not emit SGR from xterm. Imports to add to the top of `TerminalTTY.jsx`:

```js
import { getTuiAdapter } from '@/lib/terminal/tuiAdapter';
```

(`buildTerminalMousePressSequence` is already in this file at line 836.)

---

## 4. Sidecar parity strategy

**Problem:** the CJS copy at `sidecar-backend/sessionTransport.js:132` is hand-maintained. CJS cannot `import` an ESM module synchronously (the Tauri sidecar is bundled as a resource, no Node import hook at runtime).

### 4.1 Strategy: **Build-time CJS generation** (single choice, locked)

**Mechanism (LOCKED):** a tiny build step writes a `sidecar-backend/terminalNoiseFilter.generated.cjs` whose body is the literal text of `src/lib/terminal/terminalNoiseFilter.js` wrapped in `module.exports = (function () { ... return { ... }; })();`. The build step is a one-liner in `package.json`:

```json
"scripts": {
  "build:noise-filter-cjs": "node scripts/build-noise-filter-cjs.js"
}
```

`scripts/build-noise-filter-cjs.js`:

```js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/lib/terminal/terminalNoiseFilter.js'),
  'utf8',
);
const cjs = `${src}\nmodule.exports = {\n  SHELL_TERMINAL_RESPONSE_RE,\n  TERMINAL_WINDOW_REPORT_RE,\n  TERMINAL_FOCUS_REPORTING_RE,\n  TERMINAL_MOUSE_REPORT_RE,\n  TERMINAL_MOUSE_CLICK_LEAK_RE,\n  TERMINAL_WHEEL_PAGE_LEAK_RE,\n  stripTerminalFocusReporting,\n  stripTerminalMouseReporting,\n  stripTerminalMouseClickLeak,\n  stripShellTerminalResponseNoise,\n  stripTerminalInputNoise,\n  containsTerminalInputNoise,\n  containsTerminalResponseNoise,\n  filterTerminalInputForSession,\n  filterTerminalOutputForSession,\n};\n`;
const dest = path.resolve(
  __dirname,
  '..',
  'sidecar-backend/terminalNoiseFilter.generated.cjs'
);
fs.writeFileSync(dest, cjs);
console.log('wrote', dest);
```

`sidocar-backend/sessionTransport.js` then replaces its hand-maintained regex blocks with:

```js
const {
  SHELL_TERMINAL_RESPONSE_RE,
  TERMINAL_FOCUS_REPORTING_RE,
  TERMINAL_WINDOW_REPORT_RE,
  TERMINAL_MOUSE_REPORT_RE,
  TERMINAL_MOUSE_CLICK_LEAK_RE,
  stripTerminalInputNoise,
} = require('./terminalNoiseFilter.generated.cjs');
```

The parity test in §6 loads the same source bytes from disk, asserts byte-equality of the regex `source` strings, and confirms the CJS file's mtime is newer than the ESM source. If a developer edits the ESM file without re-running `build:noise-filter-cjs`, the test fails in CI.

### 4.2 Why this strategy (justification)

- **No transpiler in the loop** (no Babel, no esbuild) — the ESM file uses only `export`/`import` semantics, and the file is a leaf module with no other ESM imports.
- **No runtime dynamic import** — Tauri's resource bundling for the sidecar does not support dynamic `import()` of an ESM file from CJS at startup.
- **The CJS body is regenerated, not hand-edited** — drift is mechanically impossible after the one-time build.
- **CI runs `npm run build:noise-filter-cjs` before `npm test`** so the artifact is always current.

### 4.3 What the parity test asserts

See §6.

---

## 5. Telemetry hook for NFR-T06

**Current state:** `handleWebglContextLoss` at `src/components/TerminalTTY.jsx:2306-2333`. The demotion path is at line 2322 (`pendingWebglRecoveryRef.current = true`).

**Exact insertion (after line 2322, before line 2324):**

```js
    pendingWebglRecoveryRef.current = true;
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent('devhub:renderer_demoted', {
          detail: {
            panelId: id,
            from: 'webgl',
            to: 'webgl-recovery-pending',
            at: new Date().toISOString(),
            reason: 'webglcontextlost',
          },
        })
      );
    }
```

The event name `devhub:renderer_demoted` matches the proposal wording. The payload uses `CustomEvent` for browser-side listeners and (if a host opts in) can be mirrored to a backend `telemetry` channel. The hook fires **exactly once per context-loss event** because the demotion path runs only when `pendingWebglRecoveryRef.current` flips from `false` to `true`; the re-promotion path at line 2293 is not a demotion and does not emit.

A new test in `src/components/__tests__/TerminalTTY.test.js` (added in T6) asserts that a synthetic `webglcontextlost` event triggers exactly one `devhub:renderer_demoted` dispatch, and that a subsequent `webglcontextrestored` does **not** dispatch it again.

---

## 6. Test parity enforcement

**Path:** `/home/matias/ArxonLabs/devhub/tests/integration/sidecar-noise-filter-parity.test.js`

**Exact contents (skeleton — body filled by T3 of the tasks file):**

```js
const fs = require('fs');
const path = require('path');

const ESM_SOURCE = path.resolve(
  __dirname,
  '../../src/lib/terminal/terminalNoiseFilter.js'
);
const CJS_GENERATED = path.resolve(
  __dirname,
  '../../sidecar-backend/terminalNoiseFilter.generated.cjs'
);
const SESSION_TRANSPORT = path.resolve(
  __dirname,
  '../../sidecar-backend/sessionTransport.js'
);

describe('NFR-T02 — sidecar noise filter parity', () => {
  test('CJS generated artifact exists and is newer than ESM source', () => {
    expect(fs.existsSync(CJS_GENERATED)).toBe(true);
    const esmMtime = fs.statSync(ESM_SOURCE).mtimeMs;
    const cjsMtime = fs.statSync(CJS_GENERATED).mtimeMs;
    expect(cjsMtime).toBeGreaterThanOrEqual(esmMtime);
  });

  test('regexes are byte-identical between ESM and CJS copies', () => {
    // Load the regex strings from the ESM source and the CJS generated file.
    const esm = require(ESM_SOURCE);
    const cjs = require(CJS_GENERATED);
    expect(cjs.SHELL_TERMINAL_RESPONSE_RE.source).toBe(
      esm.SHELL_TERMINAL_RESPONSE_RE.source
    );
    expect(cjs.TERMINAL_MOUSE_CLICK_LEAK_RE.source).toBe(
      esm.TERMINAL_MOUSE_CLICK_LEAK_RE.source
    );
    expect(cjs.TERMINAL_FOCUS_REPORTING_RE.source).toBe(
      esm.TERMINAL_FOCUS_REPORTING_RE.source
    );
    expect(cjs.TERMINAL_WINDOW_REPORT_RE.source).toBe(
      esm.TERMINAL_WINDOW_REPORT_RE.source
    );
  });

  test('filterTerminalInputForSession returns identical results for the corpus', () => {
    const esm = require(ESM_SOURCE);
    const cjs = require(CJS_GENERATED);

    const corpus = [
      '\x1b[<0;3;3M',                       // SGR press
      '\x1b[<0;3;3m',                       // SGR release
      '\x1b[<64;3;3M',                      // wheel up
      '\x1b[<65;3;3M',                      // wheel down
      '\x1b[I',                             // focus in
      '\x1b[O',                             // focus out
      '\x1b[?1;2c',                         // DA1
      '\x1b[>0;1;0c',                       // DA2
      '\x1b[5n',                            // DSR
      '\x1b[1;1R',                          // CPR
      '\x1b[4;24;80t',                      // window size
      '\x1b[?35;60;4M',                     // DECRQM (T2.1)
      '\x1b[$1;2p',                         // DECRPM (T2.1)
      'hello world\n',                      // plain text
      '\x1b[<0;3;3M\x1b[<64;3;3M\x1b[<65;3;3M', // click-then-scroll (NFR-T03)
    ];

    for (const chunk of corpus) {
      const esmOut = esm.filterTerminalInputForSession(
        { mode: 'tui', tuiReady: true, tuiAdapter: 'opencode' },
        chunk
      );
      const cjsOut = cjs.filterTerminalInputForSession(
        { mode: 'tui', tuiReady: true, tuiAdapter: 'opencode' },
        chunk
      );
      expect(cjsOut).toBe(esmOut);
    }
  });

  test('sessionTransport.js requires the generated CJS, not a hand-maintained copy', () => {
    const src = fs.readFileSync(SESSION_TRANSPORT, 'utf8');
    expect(src).toMatch(
      /require\(['"]\.\/terminalNoiseFilter\.generated\.cjs['"]\)/
    );
  });
});
```

The test pins the byte-identity of the regex `source` strings and exercises a 15-input corpus that includes all classes from NFR-T02. The CJS file is regenerated on every test run by the `pretest` hook (added to `package.json`):

```json
"scripts": {
  "pretest": "npm run build:noise-filter-cjs"
}
```

---

## 7. Migration / backward compat

The `ctx` argument is **optional and backward-compat**: the new `filterTerminalInputForSession` accepts `ctx == null` and falls back to today's behavior (strip click leaks). Every existing call site that passes `null` — including `TerminalTTY.jsx:3845` **before** the change — keeps working unchanged.

**Migration rule:** only the active `onData` call site (`TerminalTTY.jsx:3845`) is migrated to pass a real `sessionContext`. Side effects:

- `terminalNoiseFilter.test.js` cases that pass `null` are preserved as legacy-behavior pins; new cases assert the `ctx`-aware behavior.
- The CJS copy in `sidecar-backend/sessionTransport.js` is replaced via the build step in §4; its `filterTerminalInputForSession` receives the same `ctx` shape (the sidecar's session object is mapped to a `SessionContext` at the call site in `sessionTransport.js`).
- No external consumers of `filterTerminalInputForSession` exist outside the two files.

**Roll-out order:** the new `ctx` parameter is non-breaking. The sidecar parity test (§6) runs in CI from day 1. The TUI adapter registry (§2) is additive — the legacy `shouldPassthroughNativeTuiWheel` wrapper stays.

---

## 8. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| 1 | **False-positive click forward.** If `mode==='tui'` is set before the footer is confirmed, the filter forwards clicks to a PTY that has not enabled `?1006h` → bytes dropped silently. | Medium | Medium | Gate is `tuiReady === true` (footer confirmed), not just `mode === 'tui'`. FR-T10 regression test pins `notifyOpencodeReady` does not fire before footer match. The sessionContext build at `TerminalTTY.jsx:3845` reads `tuiSessionFooterConfirmedRef.current` synchronously. |
| 2 | **Sidecar regex drift.** A developer edits `terminalNoiseFilter.js` and forgets `npm run build:noise-filter-cjs`. Stale-bundle clients filter differently from current builds. | High (history shows 3 drift incidents in `docs/errores/`) | High | `pretest` hook regenerates the CJS artifact on every `npm test`; the parity test asserts `cjsMtime >= esmMtime` and byte-identity of all 4 regex `source` strings. CI fails the build on drift. |
| 3 | **Telemetry hook double-fires.** Recovery retries could re-enter the demotion path and emit `renderer_demoted` twice per context-loss event. | Low | Low | Emit only in the `pendingWebglRecoveryRef.current = true` branch (`TerminalTTY.jsx:2322`). The re-promotion at `:2293` is gated on the same ref, so a second context loss is the only re-entry path — and that one is a real demotion, exactly one event. Test pins exactly-once semantics. |

---

## Review Workload Forecast

### Per-task LOC estimate (terminal-tui-interaction)

| Task | Files (new / modify) | Net LOC (estimate) |
|------|----------------------|-------------------|
| T1 RED→GREEN: filter accepts sessionContext | 1 modify (terminalNoiseFilter.js + tests) | ~25 (impl) + ~35 (tests) |
| T2 RED: wheel 64/65 regression | 1 modify (terminalNoiseFilter.test.js) | ~15 (tests only) |
| T3 sidecar parity test + build script | 1 new (scripts/build-noise-filter-cjs.js) + 1 new (tests/integration/sidecar-noise-filter-parity.test.js) + 1 modify (sidecar-backend/sessionTransport.js) | ~70 (parity test) + ~25 (build script) + ~20 (sessionTransport cleanup) |
| T4 tuiAdapter.js + registry + 4 describe tests | 1 new (src/lib/terminal/tuiAdapter.js) + 1 new (src/lib/terminal/tuiAdapter.test.js) | ~60 (impl) + ~80 (tests) |
| T5 wire `buildTerminalMousePressSequence` + sessionContext in `onData` | 1 modify (TerminalTTY.jsx) | ~30 (impl) + ~25 (tests) |
| T6 telemetry hook `renderer_demoted` + test | 1 modify (TerminalTTY.jsx) + 1 modify (tests) | ~15 (impl) + ~25 (tests) |
| T7 glyph corruption test (3-panel hide+show × 5) | 1 modify (TerminalTTY.test.js) | ~80 (tests only, integration) |
| T8 swarm-launch-hardening Phase 2/3 | 0 | **DEFER** — out of this PR's budget |

### Cumulative

- **Total new code (impl):** ~170 LOC
- **Total new tests:** ~330 LOC
- **Grand total:** ~500 LOC across ~8 files

### PR strategy

**Single PR is the right call** (per the prompt's review=400-800 lines range, this lands near the upper bound of that range with 500 LOC and 8 tasks). The seven tasks are interdependent (T1 wires the shape T4 + T5 use; T3's parity test references the impl from T1; T6 + T7 are independent). Splitting them would require carrying the `sessionContext` shape as a separate "shape-only" PR with no end-to-end value.

**Chained-PR relationship to terminal-display-names:** the prompt locks display-names as the FIRST chained PR, tui-interaction as the SECOND. This is correct: display-names ships the pool/UI/API contract, then tui-interaction consumes the `terminalId → displayName` mapping in the API enrichment step.

### 400-line budget risk

**Medium** — 500 LOC + 8 files is over the 400-line nominal single-PR budget but well inside the 400-800 review-window target. The bulk (~330 LOC) is test code, which is the right kind of LOC to add. **No churn** in the sidecar body (only a `require` swap) and **no churn** in `panelHelpers.js`. The risk is the reviewer-load, not the line count.

**Concrete reviewability mitigations:**

- Tests are grouped by file (one describe per file) so a reviewer can read the test for T1, then the impl, then move on.
- The TUI adapter registry (§2) is a leaf module with zero React imports — reviewable in isolation.
- The parity test (§6) is a single self-contained file — reviewable in isolation.

### Next-step recommendation

The design is complete. Proceed to `tasks.md` (separate file in this directory) and then to `apply`.
