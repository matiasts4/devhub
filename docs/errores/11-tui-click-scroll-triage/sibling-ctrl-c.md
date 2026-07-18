# Sibling panel death on Ctrl+C (Windows)

## Symptom (2026-07-17)

Split: OpenCode | Grok (or second agent). Ctrl+C in the active OpenCode panel → OpenCode shows “Sesión finalizada”, sibling drops to a bare PowerShell and loses the agent session.

## Cause

1. Windows ConPTY often exits the whole host with `STATUS_CONTROL_C_EXIT` (`-1073741510`). That can hit **more than the focused panel**.
2. DevHub’s respawn policy restored a **bare shell** for any TUI that died with that exit code — so the sibling looked “closed” even when the user never touched it.
3. `ttyServer` also ran `taskkill /T` before respawn, which can race and wound other trees (sidecar already avoided this).

## Fix

- Track `panel-focus` + `session-meta.launchCommand` from the client.
- **Bootstrapped** (modal / `launchCommand`): any TUI death → fast shell respawn (short banner, 50ms relaunch yield).
- **Nested typed TUI** (no `launchCommand`): do not intervene on clean quit (instant PS prompt). Only heal Win Ctrl+C host-death.
- Unfocused bootstrapped sibling → relaunch agent after shell respawn.
- Remove pre-respawn `taskkill` from `ttyServer` (align with sidecar).

## Verify

1. OpenCode + Grok side by side.
2. Focus OpenCode, Ctrl+C.
3. OpenCode may finalize or drop to shell; **Grok should come back** (yellow “colateral / Relanzando” then agent UI), not stay on `PS D:\…>` alone.
