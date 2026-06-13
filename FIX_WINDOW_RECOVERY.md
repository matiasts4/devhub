# DevHub — Window Recovery + Tray Icon Fix

## Goal

Fix the UX bug where closing the DevHub window leaves the app hidden with **no way to bring it back**. Add a system tray icon and force the window to show on second-launch recovery.

---

## Diagnosis (already complete, do not re-investigate)

**Bug flow:**
1. App starts. Sidecar connects. Everything works.
2. User closes the window → `CloseRequested` handler at `src-tauri/src/lib.rs:~802-816` calls `window.hide()` and logs `"Ventana ocultada"`.
3. App keeps running in background. **No tray icon. No menu. No recovery.**
4. User re-launches `/usr/bin/devhub`. The `tauri-plugin-single-instance` handler at `lib.rs:~787` calls `restore_main_window`.
5. `restore_main_window` calls `window.show()`, but the `next_ready` gate at `lib.rs:~773-780` immediately hides the window again because the sidecar's `next_ready` atomic is `false`.
6. The recovery thread at `lib.rs:~200-223` polls waiting for ready, but the user never sees the window.

**Root cause:** no tray icon (primary) + `next_ready` gate too aggressive on recovery (secondary).

**Confirmed working state (last good run, log @ 04:28):**
```
[Sidecar] WS conectado a sesión p9944 (1 clientes, transport=json)
...
[Sidecar] WS desconectado de sesión p9944 (0 clientes restantes)
[DevHub] Ventana ocultada (app sigue en background con el sidecar activo).
```

Sidecar responds to HTTP on `127.0.0.1:4000` (returns 404 for `/`, which is normal — Next.js doesn't have a root route). Sidecar is healthy.

**Window label:** almost certainly `"main"` (Tauri 2 default). Verify in `src-tauri/tauri.conf.json` under `app.windows[].label` before applying.

---

## What NOT to do (already tried, failed or wasted time)

- **DO NOT** spend time re-running pkill loops, killing stale procs, or cleaning lock files unless asked. The user already did this. Fresh start is fine.
- **DO NOT** add `tauri-plugin-tray` as a dependency. Tauri 2 has built-in tray support via `tauri::tray::*` and `tauri::menu::*`. No extra plugin needed.
- **DO NOT** create a symlink at `/usr/bin/devhub-server-x86_64-unknown-linux-gnu`. That was an earlier wrong theory. The wrapper at `/usr/bin/devhub-server` is what Tauri resolves. The symlink is harmless but useless — leave it.
- **DO NOT** modify `tauri.conf.json` bundle id, version, or icon paths. Bundle id is `com.devhub.desktop` — correct.
- **DO NOT** push to git or amend existing commits. Just edit, build, install locally.

---

## Files to modify

Only **one** file needs real changes:

- `src-tauri/src/lib.rs` — add tray icon in `setup()`, fix single-instance recovery

**No Cargo.toml changes.** Tauri 2 tray is built-in.

**No new icon assets.** Reuse the app's default window icon via `app.default_window_icon().cloned()`.

---

## The fix — paste-ready code

### 1. Imports (top of `lib.rs`)

Add near the existing `use tauri::...` block:

```rust
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
```

If the project uses `tauri::Manager` already, you're good. If not, add:
```rust
use tauri::Manager;
```

### 2. Tray icon — inside the `setup` closure

Find the `setup` function in `lib.rs` (the closure passed to `.setup(...)` in the `tauri::Builder::default()` chain). **At the end of that closure**, before it returns, add:

```rust
    // --- Tray icon: persistent recovery affordance ---
    let show_item = MenuItem::with_id(app, "show", "Mostrar ventana", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Ocultar ventana", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().unwrap())
        .tooltip("DevHub")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let window = app.get_webview_window("main");
            match event.id.as_ref() {
                "show" => {
                    if let Some(w) = &window {
                        let _ = w.show();
                        let _ = w.set_focus();
                        info!("[Tray] Mostrar ventana solicitado por menú");
                    }
                }
                "hide" => {
                    if let Some(w) = &window {
                        let _ = w.hide();
                        info!("[Tray] Ocultar ventana solicitado por menú");
                    }
                }
                "quit" => {
                    info!("[Tray] Salir solicitado por menú");
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { button, button_state, .. } = event {
                if button == MouseButton::Left && button_state == MouseButtonState::Up {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        let visible = window.is_visible().unwrap_or(false);
                        if visible {
                            let _ = window.hide();
                            info!("[Tray] Ventana ocultada por click en ícono");
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                            info!("[Tray] Ventana mostrada por click en ícono");
                        }
                    }
                }
            }
        })
        .build(app)?;

    info!("[Tray] Ícono de bandeja registrado");
    Ok(())
```

**Adapt to the existing code style:**
- The codebase uses `info!()` from `tauri-plugin-log` — make sure `use log::{info, warn};` or similar is at the top
- If the existing `setup` closure uses a different signature (e.g., `move |app| { ... }`), the code above is a drop-in
- The trailing `Ok(())` matches Tauri 2's `setup` return type
- If there's a `?` operator concern, use `.expect("...")` or match — match the surrounding style

### 3. Recovery fix — single-instance handler

Find the single-instance handler around `lib.rs:~787`. It calls `restore_main_window`. **Right before that call**, force the window to show:

```rust
                // Force window visible BEFORE restore_main_window — bypass the
                // next_ready gate that would otherwise hide it again.
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
```

That's it. Surgical. Doesn't touch the `next_ready` logic, just overrides it for the recovery path.

### 4. (Optional but recommended) — make the recovery thread also force-show

If the recovery thread at `lib.rs:~200-223` is the one that's supposed to un-hide the window when next_ready becomes true, **make sure it actually calls `window.show()` and `window.set_focus()`** (not just `window.unminimize()` or similar). Read those 20 lines and confirm.

---

## Build and install

The repo has a `Makefile` and `package.json`. Try in this order:

```bash
cd /home/matias/ArxonLabs/devhub

# Fastest path — uses sccache + mold (already configured in ~/.cargo/config.toml)
make build
# OR
pnpm tauri build --bundles deb
# OR (fallback)
cargo tauri build --bundles deb
```

**Cold build:** ~1m50s. **Warm build with sccache:** ~50s. The `target/` dir is already warmed up.

Then install the new .deb:

```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/DevHub_*.deb
# or
sudo apt install ./src-tauri/target/release/bundle/deb/DevHub_*.deb
```

If dpkg complains about dependencies:
```bash
sudo apt-get install -f -y
```

---

## Verification

After install:

1. **Kill any stale devhub procs** (defensive):
   ```bash
   pkill -9 devhub 2>/dev/null
   ```

2. **Launch fresh:**
   ```bash
   /usr/bin/devhub &
   ```

3. **Expected:**
   - Window appears within 2-3 seconds
   - Tray icon appears in system tray
   - Log file gets fresh entries at `~/.local/share/com.devhub.desktop/logs/DevHub.log`

4. **Test tray menu:** right-click the tray icon → should show "Mostrar ventana / Ocultar ventana / Salir"

5. **Test left-click toggle:** left-click the tray icon → window should toggle

6. **Test close-then-recover:** close the window with X → re-run `/usr/bin/devhub` → window should reappear (not stay hidden)

7. **Check the log** for the new `[Tray]` entries:
   ```bash
   tail -20 ~/.local/share/com.devhub.desktop/logs/DevHub.log
   ```

---

## Key file locations

| File | Purpose |
|---|---|
| `src-tauri/src/lib.rs` | All Rust logic — main target of changes |
| `src-tauri/tauri.conf.json` | Verify window label here (`app.windows[].label`) |
| `src-tauri/Cargo.toml` | **NO CHANGES** — tray is built-in |
| `src-tauri/icons/` | **NO CHANGES** — reuse default icon |
| `~/.local/share/com.devhub.desktop/logs/DevHub.log` | Runtime log, watch this for verification |
| `~/.devhub/sidecar.pid` / `sidecar-port.txt` | Sidecar runtime state, can be left alone |
| `/usr/lib/DevHub/resources/devhub-server` | Bundled sidecar (Next.js) — leave alone |
| `/usr/bin/devhub` | Installed launcher — leave alone |
| `/usr/bin/devhub-server` | Wrapper script for sidecar — leave alone |
| `/usr/bin/devhub-server-x86_64-unknown-linux-gnu` | Pointless symlink from earlier debug — harmless, can remove or ignore |

---

## Tauri 2 API quick reference

Tray icon:
```rust
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
```

Menu:
```rust
use tauri::menu::{Menu, MenuItem};
```

Window control:
```rust
window.show()
window.hide()
window.set_focus()
window.unminimize()
window.is_visible() -> Result<bool>
```

App handle:
```rust
app.get_webview_window("main") -> Option<WebviewWindow>
app.exit(0)
```

---

## What the next agent should do (TL;DR)

1. Read `src-tauri/src/lib.rs` to confirm the structure and exact line numbers.
2. Verify the window label in `tauri.conf.json` (almost certainly `"main"`).
3. Apply the three code blocks above.
4. Build with `make build` or `pnpm tauri build --bundles deb`.
5. Install the .deb.
6. Run the verification steps.
7. Report back: what changed, build time, install result, did the tray icon appear, did the window show on second launch.

**Estimated time:** 5-10 minutes if the agent reads this file first and doesn't go re-investigating.

---

## Session context (for the next agent)

This file was written after a long debugging session where:
- We confirmed the app IS working (sidecar, HTTP, log all fine)
- We traced the bug to the missing tray icon + aggressive `next_ready` gate
- An earlier delegated sub-agent returned empty/no output, so the code was never applied
- The user is frustrated and wants this fixed quickly — be tight, don't pad, don't re-investigate what's in this doc

**The previous orchestration context is in Engram** (observation 6514, topic_key `devhub/launch-debug-tactics`) if more detail is needed, but this .md should be sufficient.
