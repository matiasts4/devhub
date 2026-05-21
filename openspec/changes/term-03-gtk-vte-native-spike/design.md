# Design: TERM-03 GTK VTE Native Spike

## Technical Approach

TERM-03 stays same-window and in-app as the real goal, but evidence now moves in two steps: first prove GTK/VTE itself in isolation, then move inward to Tauri same-window attach. The app contract does not change: React still owns requested/effective renderer state, `xterm` stays the hard visible fallback, and native GTK/VTE stays behind one JS seam. The new diagnostic slice adds a tiny standalone GTK/VTE smoke harness outside DevHub/Tauri webview integration so we can separate “GTK/VTE stack works” from “same-window Tauri embedding works.”

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Evidence order | Keep pushing Tauri integration first; isolate GTK/VTE first | Standalone GTK/VTE harness first, then same-window attach | Smallest honest move after getting stuck at the same boundary. |
| Harness shape | Scripted shell test; full app fork; tiny Rust GTK binary | `src-tauri/src/bin/gtk_vte_smoke.rs` tiny Rust binary | Reuses the real Rust/GTK/VTE stack with minimal unrelated app code. |
| Toolchain workflow | Manual env exports; project-local wrapper | Supported command via project script reusing current pkg-config stabilization | Keeps user workflow repeatable and avoids shell-memory hacks. |
| Live widget ownership in app | Store widgets in `State<T>`; main-thread registry | Main-thread-only registry + metadata-only `State<T>` | GTK/VTE remains non-`Send`; app integration still needs this boundary. |
| Fallback timing | Replace `xterm` optimistically; keep `xterm` until native success | Keep live `xterm` until in-app native open succeeds | Harness is diagnostic only; product fallback semantics stay unchanged. |
| Tauri command args | Pass native payload fields top-level; wrap under command arg name | Wrap all native VTE bridge payloads as `{ request: payload }` | Rust commands accept a named `request` parameter; top-level payloads fail before Rust probe/open and collapse into generic `probe-failed`. |
| Native hit-testing | Full-window GTK overlay layout; terminal-bounds layout | Position a small GTK layout at terminal bounds and put VTE at `(0,0)` inside it | The visible GTK/VTE terminal must receive input without stealing clicks from workspace tabs, chrome, or other DevHub UI outside the terminal rectangle. |
| GTK parent chain | Overlay inside Tauri `default_vbox`; overlay direct under GTK window | Mount overlay as direct GTK window child and webview as overlay main child | Tauri's Linux undecorated resize handler unwraps `webview.parent().parent()` as `gtk::Window`; putting overlay under `default_vbox` makes that grandparent a `GtkBox` and crashes on outside clicks. |
| Workspace switch lifecycle | Close VTE on inactive panel; keep lease hidden while inactive | Keep the active native lease/process alive and toggle GTK layout visibility on inactive/active transitions | Workspace/window switching must not respawn the shell or repaint the full terminal; hiding the layout prevents native overlay bleed-through while preserving session state. |
| Native resize triggers | Only listen to browser `window.resize`; observe terminal placeholder geometry | Use `ResizeObserver` on the native placeholder/container plus `window.resize` | Split handles and panel-width changes resize DOM containers without firing a browser window resize, so GTK/VTE must be resized from the element geometry itself. |
| Product default renderer | Keep xterm as default; promote GTK VTE after stability | Make GTK VTE the default renderer while keeping xterm as explicit fallback/recovery | User validation showed GTK/VTE no longer crashes and is functional enough to become the default; unsupported runtimes still resolve to xterm fallback through capabilities. |
| V1/V2 view switches | Unmount closes native lease; unmount hides and reopen reuses live lease | Hide native GTK layout on React unmount and make Rust reopen reuse the same active panel when live | DevHub view switches currently unmount inactive V1/V2 React trees; closing on unmount killed OpenCode sessions. |
| Native theme | Use VTE defaults; set DevHub-aligned palette | Set VTE foreground/background/cursor/selection to DevHub surface/accent colors | Native GTK/VTE should visually blend with the app instead of showing a mismatched black/default terminal palette. |

## Data Flow

```text
Diagnostic path
  npm run native:vte-smoke
    -> wrapper injects Linux pkg-config env
    -> cargo run --bin gtk_vte_smoke
    -> standalone GTK window + VTE shell
    -> manual evidence: open, type, resize, close

Product path
  TerminalTTY -> nativeVteBridge -> Tauri commands
    -> bridge wraps payload as { request }
    -> run_on_main_thread -> main-thread registry
    -> same-window attach only after probe/open success
    -> webview remains two ancestors away from GTK window for Tauri resize handler
    -> GTK layout event region constrained to terminal bounds
    -> inactive workspaces hide the GTK layout without closing the VTE lease
    -> active placeholder ResizeObserver sends native resize on split/panel geometry changes
    -> V1/V2 React unmount hides native layout; later open of same panel reuses live registry terminal
    -> else effectiveMode = xterm + visible recovery banner
```

Harness proves:
- GTK/VTE libraries load with the supported workflow.
- A real VTE shell can spawn, accept input, resize, and close cleanly.

Harness does **not** prove:
- same-window attach inside DevHub/Tauri,
- React/panel lifecycle correctness,
- overlay alignment with panel bounds,
- workspace switching behavior,
- anything about removing `xterm` fallback.

## File Changes

| File | Action | Description |
|---|---|---|
| `src-tauri/src/bin/gtk_vte_smoke.rs` | Create | Minimal standalone GTK window containing one VTE terminal for diagnostic evidence only. |
| `scripts/native-vte-smoke.cjs` | Create | Runs the smoke binary with the same Linux pkg-config env strategy already used by supported tooling. |
| `package.json` | Modify | Add supported user command, e.g. `npm run native:vte-smoke`. |
| `scripts/tauri-cli.cjs` | Reuse | Source of truth for Linux pkg-config path merging; harness wrapper should reuse the same logic instead of duplicating paths. |
| `src-tauri/src/native_vte.rs` | Keep planned | Main-thread registry for real in-app attach remains the next inward slice after harness evidence. |
| `src/components/TerminalTTY.jsx` | Keep planned | `xterm` remains mounted until in-app native open succeeds. |

## Interfaces / Contracts

```text
Supported workflow:
  npm run native:vte-smoke

Expected manual evidence:
  1. standalone GTK window opens
  2. VTE shell prompt appears
  3. typing works
  4. resize updates terminal correctly
  5. close exits cleanly without orphan process/window
```

The harness is a debug/isolation tool only. It MUST NOT be wired into renderer selection, workspace state, or product fallback logic.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Rust unit | Harness startup helpers and shared env shaping | Small pure helper tests where possible. |
| Manual diagnostic | Open/prompt/type/resize/close in standalone window | Capture screenshots/logs for pass/fail evidence. |
| App integration | Keep existing TERM-03 tests for requested/effective mode and `xterm` fallback | No change in product fallback expectations. |

## Migration / Rollout

No migration. Recommended supported workflow is project-local: add a smoke-harness script that reuses the existing pkg-config stabilization. Do **not** treat the standalone window as product direction; it is only a gate for the next in-app slice.

Outcome rules:
- **Harness passes**: GTK/VTE stack is viable; next slice focuses only on same-window registry attach inside Tauri.
- **Harness fails**: stop pushing in-app embedding; fix GTK/VTE/runtime/toolchain issues first or reject GTK/VTE honestly for TERM-03.

## Open Questions

- [ ] Should the harness wrapper import `buildTauriEnv()` directly or extract a tiny shared native-env helper first?
- [ ] After harness pass, what is the smallest next attach proof: fixed overlay region first, or active-panel bounds immediately?
- [ ] Same-window requirement remains unchanged; final TERM-03 success still requires in-app evidence, not standalone success.
