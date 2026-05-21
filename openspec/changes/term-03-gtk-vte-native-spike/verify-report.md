## Verification Report

**Change**: term-03-gtk-vte-native-spike
**Version**: N/A
**Mode**: Strict TDD

---

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 7 |
| Tasks complete | 6 |
| Tasks incomplete | 1 |

Incomplete:
- 6.7 manual same-window GTK/VTE QA + refreshed evidence

---

### Build & Tests Execution

**Build**: ➖ Not run

**Tests**: ✅ 14 passed / 0 failed / 0 skipped *(latest focused reruns in this batch)*

Executed:
- `npm test -- --runTestsByPath "tests/unit/tauri-cli.test.js"` *(green safety net: `6/6` before wrapper changes)*
- `npm test -- --runTestsByPath "tests/unit/tauri-cli.test.js"` *(green final: `9/9` after dev-url reuse/config-override fix)*
- `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test nextjs_readiness -- --nocapture` *(green: `3/3` safety net after runtime classification extraction)*
- `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test devhub_runtime_process -- --nocapture` *(green: `2/2` new runtime-classification coverage)*
- `npm run tauri:dev` *(manual runtime validation: Next `3100` reuse confirmed; first rerun still exposed stale sidecar `4000` adoption gap)*
- `npm run tauri:dev` *(manual runtime validation after sidecar classification fix: runtime reached stable state with reused Next and fresh sidecar on `127.0.0.1:4000`; same-window GTK/VTE UI proof still pending)*

**Coverage**: ➖ Not re-run in this batch

---

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Present in `apply-progress.md` |
| All tasks have tests | ✅ | 6/7 tasks have explicit test evidence; 1 manual QA task remains |
| RED confirmed (tests exist) | ✅ | New wrapper/runtime tests were added first, then one focused Jest rerun failed `8/9` until the stale expectation was corrected |
| GREEN confirmed (tests pass) | ✅ | Latest focused reruns passed `9/9` in `tauri-cli.test.js`, `3/3` in `nextjs_readiness`, and `2/2` in `devhub_runtime_process` |
| Triangulation adequate | ✅ | Wrapper path has ready/not-ready cases; runtime classification has positive and negative process cases |
| Safety Net for modified files | ✅ | Existing suites were rerun and stayed green |

**TDD Compliance**: 6/6 checks passed

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 14 | `tests/unit/tauri-cli.test.js`, `src-tauri/src/lib.rs` | Jest, cargo test |
| Integration | 0 | 0 | — |
| E2E | 0 | 0 | playwright test available |
| **Total** | **14** | **2** | |

---

### Changed File Coverage
| File | Line % | Branch % | Uncovered Lines | Rating |
|------|--------|----------|-----------------|--------|
| `scripts/tauri-cli.cjs` | Not re-measured | Not re-measured | Focused Jest path only | ✅ Covered by targeted unit tests |
| `src-tauri/src/lib.rs` | Not re-measured | Not re-measured | Focused cargo test path only | ✅ Covered by targeted unit tests |

**Average changed file coverage**: ➖ Not re-run in this batch

---

### Assertion Quality
✅ All assertions verify real behavior

---

### Quality Metrics
**Linter**: ⚠️ 19 warnings / 4 errors
**Type Checker**: ➖ Not available

---

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Same-Window In-Panel Native Evidence | Same-window evidence is observable on successful open | Previous focused React/native evidence still stands; this batch only unblocked manual runtime re-entry | ⚠️ PENDING MANUAL |
| Same-Window In-Panel Native Evidence | Same-window evidence is observable on successful open | `npm run tauri:dev` now reaches stable runtime startup without false port collisions | ⚠️ PARTIAL |
| Active Panel Lifecycle Boundary | Open, focus, and resize stay bound to the active panel | `src/components/__tests__/TerminalTTY.test.js > probes and opens native GTK VTE only for the active experimental panel` | ✅ COMPLIANT |
| Active Panel Lifecycle Boundary | Close or panel switch ends the active native lifecycle cleanly | `src/components/__tests__/TerminalTTY.test.js > closes the native lease when the active experimental panel becomes inactive` | ✅ COMPLIANT |
| TERM-03 Exclusions Remain Explicit | Second native panel is out of scope | `src/components/__tests__/terminalRendererCapabilities.test.js > keeps Ghostty out of TERM-03 even when Linux GTK VTE runtime is ready` | ✅ COMPLIANT |
| Explicit GTK VTE Request Uses Existing Renderer Path | Active panel explicitly requests GTK VTE experimental mode | `src/components/__tests__/TerminalTTY.test.js > probes and opens native GTK VTE only for the active experimental panel` | ✅ COMPLIANT |
| Explicit GTK VTE Request Uses Existing Renderer Path | Restore reuses the same requested renderer contract | `src/components/__tests__/TerminalTTY.test.js > restore with invalid experimental renderer keeps xterm surface visible with fallback recovery UI` | ⚠️ PARTIAL |
| TERM-03 Selection Scope Boundary | Out-of-scope renderer behavior is rejected from TERM-03 | `src/components/__tests__/terminalRendererCapabilities.test.js > keeps Ghostty out of TERM-03 even when Linux GTK VTE runtime is ready` | ✅ COMPLIANT |
| Linux Native Readiness Gates Effective Renderer | Ready Linux native path uses GTK VTE | `src/components/__tests__/terminalRendererCapabilities.test.js > marks GTK VTE ready only after Linux + Tauri + successful runtime probe` | ✅ COMPLIANT |
| Linux Native Readiness Gates Effective Renderer | Unsupported or unavailable native path falls back to xterm | `src/components/__tests__/terminalRendererCapabilities.test.js > maps unsupported platform and missing Tauri to deterministic VTE fallback reasons` | ✅ COMPLIANT |
| Fallback Remains Usable and Recoverable | Runtime native failure recovers in place | `src/components/__tests__/TerminalTTY.test.js > runtime native errors recover the same panel back to xterm in place` | ✅ COMPLIANT |
| Fallback Remains Usable and Recoverable | Visible recovery action resets the request | `src/components/__tests__/TerminalTTY.test.js > restore with invalid experimental renderer keeps xterm surface visible with fallback recovery UI` | ⚠️ PARTIAL |

**Compliance summary**: 9/12 scenarios compliant, 2 partial, 1 pending manual

---

### Correctness (Static — Structural Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Same-window in-panel native evidence | ⚠️ Pending manual proof | Implementation still exists, and this batch restored honest runtime entry so manual QA can continue |
| Active-panel lifecycle boundary | ✅ Implemented | Open/focus/resize/close are gated to the active panel |
| TERM-03 exclusions explicit | ✅ Implemented | Ghostty/external-window/multi-panel behavior remains out of scope |
| TERM-02 requested/effective semantics preserved | ✅ Implemented | Requested mode preserved; xterm remains fallback surface |

---

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Main-thread-only GTK/VTE registry + metadata-only state | ✅ Yes | Live GTK/VTE objects remain outside `State<T>` |
| Commands hop through `run_on_main_thread` | ✅ Yes | Rust command routing follows the design slice |
| Keep xterm until native open succeeds | ✅ Yes | JS side keeps xterm alive on probe/open/runtime failure |
| Project-local pkg-config stabilization | ✅ Yes | `scripts/tauri-cli.cjs` injects Linux defaults |
| HTTP `/` readiness gate for Tauri dev | ✅ Yes | `src-tauri/src/lib.rs` probes `GET /` status |
| Reuse existing dev server during Tauri manual QA | ✅ Yes | `scripts/tauri-cli.cjs` now injects a temporary config override when `devUrl` already responds |
| Sidecar cleanup/adoption recognizes real runtime labels | ✅ Yes | `src-tauri/src/lib.rs` now treats `MainThread`-reported sidecar listeners as DevHub runtime processes |

---

### Issues Found

**CRITICAL**
- None

**WARNING**
- 1 task remains incomplete: manual same-window GTK/VTE evidence refresh (`6.7`).
- This batch restored honest `tauri:dev` runtime entry, but it did not yet capture the required in-panel GTK/VTE screenshots/logs.

**SUGGESTION**
- Re-run manual same-window QA with the now-stable `npm run tauri:dev` path and capture screenshots/logs before archive.

---

### Verdict
PASS WITH WARNINGS

Dev runtime re-entry is fixed: `tauri:dev` now reuses the existing Next server and can relaunch/adopt the sidecar without false `EADDRINUSE` blockers. Task `6.7` still needs honest same-window GTK/VTE manual evidence before archive.
