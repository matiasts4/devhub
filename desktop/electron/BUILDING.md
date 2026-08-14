# Building, releasing and updating DevHub Desktop

How to build the Electron app, version it, and ship updates **without
uninstalling** — updates install in place and user data survives.

Related: [`README.md`](./README.md) (dev loop, IPC, smoke scripts) and the
"Auto-update" section there for the updater module itself.

## TL;DR

| Goal | Command | Output |
|------|---------|--------|
| Fast test build (no installer) | `pnpm electron:pack` | `dist/electron/win-unpacked/DevHub.exe` — run it directly |
| Release installer | `pnpm electron:build` | `dist/electron/DevHub-Setup-<version>-x64.exe` + `latest.yml` + `.blockmap` |
| Serve updates locally | `pnpm electron:feed` | `http://127.0.0.1:9100/devhub` serving `dist/electron/` |

Day-to-day iteration on the packaged app: `electron:pack` → run the unpacked
exe. Only build the NSIS installer when you are cutting a release or testing
the update flow itself.

## Prerequisites

- `pnpm install` at repo root (Electron + electron-builder + electron-updater
  are root deps).
- The packaged app expects the production resources already present
  (`src-tauri/resources/**` including `standalone.zip`, `sidecar-backend/**`).
  If you changed the Next app or the sidecar, rebuild those first:
  `pnpm build` and `pnpm build:sidecar`.

## Versioning

The version comes from root `package.json` → `"version"`. electron-updater
compares it against the feed's `latest.yml`; **a build with the same version
is never offered as an update**, so bump before every release:

```bash
# permanent bump
pnpm version patch   # or edit package.json by hand
pnpm electron:build

# one-off bump without touching package.json (no `--`: pnpm would pass it
# literally to electron-builder and the version flag gets ignored)
pnpm electron:build -c.extraMetadata.version=0.1.1
```

Artifact names embed the version (`DevHub-Setup-0.1.1-x64.exe`). **Policy: keep
only ONE active version in `dist/electron/`.** Each installer is ~750 MB, so
before every new release build wipe the previous artifacts (see next section).

## Cleanup policy: one active version only

`dist/electron/` accumulates ~750 MB per installer (plus `.blockmap`,
`win-unpacked/` ~1.5 GB and stale `*.nsis.7z` intermediates). Do NOT keep old
versions around: before building a new release, delete everything in the
folder and let the build regenerate only the current version:

```bash
# Git Bash
rm -rf dist/electron/*

# PowerShell
Remove-Item dist/electron/* -Recurse -Force
```

Trade-off we accept: with no previous `.exe`/`.blockmap` on the feed, an
update may fall back to a full-installer download instead of a differential
one. That is fine for our local-feed flow — disk space matters more here.

## The update flow (how it works)

1. `electron-builder.yml` has a `publish` entry (generic provider). That makes
   the build emit `latest.yml` (version + sha512 + file list) and bake
   `resources/app-update.yml` (feed URL) into the installer.
2. `desktop/electron/updater.js` checks the feed ~15s after boot (packaged
   builds only), downloads in the background — **differentially** via the
   `.blockmap`, so users pull only changed chunks, not the full installer.
3. When the download finishes, a dialog offers "Reiniciar ahora / Más tarde".
   The NSIS updater replaces only program files; `userData`
   (`%APPDATA%/DevHub`) and app state are untouched. "Más tarde" installs on
   the next quit.
4. Manual check: system tray → **Check for updates**.
5. Any feed/network error is logged and ignored (fail-open) — the app never
   breaks because an update check failed.

## Testing a real update end-to-end

```bash
# 1. Install the current installer ONCE (this is the last install ever):
#    dist/electron/DevHub-Setup-0.1.0-x64.exe

# 2. Wipe the previous release (one active version only — see policy above),
#    then build the next version:
rm -rf dist/electron/*
pnpm electron:build -c.extraMetadata.version=0.1.1

# 3. Serve the feed (keep this terminal open):
pnpm electron:feed

# 4. Launch the installed DevHub. Within ~15s it finds 0.1.1, downloads it
#    and prompts for restart. After restart you are on 0.1.1 with the same
#    userData, settings and data.
# 5. Confirm the new version at a glance: the left sidebar shows "v<version>"
#    in its bottom strip (in Electron it reflects app.getVersion(), i.e. the
#    real installed binary).
```

Watch for `[DevHub Updater]` lines in the logs: `checking` → `update
available` → `download progress` → `update downloaded`.

## Configuration (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `DEVHUB_UPDATE_URL` | baked-in `http://127.0.0.1:9100/devhub` | Point an existing install at another feed (LAN server, staging, prod) without rebuilding |
| `DEVHUB_UPDATE_FORCE` | off | `=1` enables update checks in unpackaged runs (debugging) |
| `DEVHUB_FEED_PORT` | `9100` | Port for `pnpm electron:feed` |

Example — installed app updating from another machine on the LAN:

```powershell
$env:DEVHUB_UPDATE_URL = "http://192.168.1.10:9100/devhub"
& "C:\Users\<you>\AppData\Local\Programs\DevHub\DevHub.exe"
```

## Releasing to real users

1. Put the feed somewhere reachable (static HTTP hosting is enough — it only
   needs `latest.yml`, the `.exe` and the `.blockmap`).
2. Rebuild with the production URL in `electron-builder.yml` → `publish.url`.
3. Ship the installer once; every later release is just "upload 3 files to
   the feed" — installed apps update themselves.

Notes:

- **Differential updates** work best when the previous version's `.exe` +
  `.blockmap` stay on the feed next to the new ones. Our cleanup policy
  deliberately drops them (one active version), so updates may download the
  full installer — accepted; only revisit this for a multi-user production
  feed.
- **Unsigned builds** may trigger a Windows SmartScreen warning on install and
  on update install. It does not block updates, but production releases should
  be code-signed.
- The updater cache dir is named `frontend-updater` (derived from the root
  package.json `"name"`). Cosmetic only.

## Data safety (what survives updates and uninstalls)

- Update in place: everything survives — the updater never touches `userData`.
- Uninstall: `electron-builder.yml` sets `deleteAppDataOnUninstall: false`, so
  `%APPDATA%/DevHub` (settings, window state, extracted standalone runtime) is
  kept even if someone uninstalls.
- Dev (`pnpm electron:up` / `electron:dev`) uses an isolated userData at
  `~/.devhub-dev/electron-user-data` (override with `DEVHUB_HOME`), so dev runs
  never touch the installed app's data.

## Troubleshooting

- **"missing latest.yml" in the feed output** → you ran `electron:pack`
  (dir build); run `pnpm electron:build` to produce update metadata.
- **App never finds updates** → check the feed URL serves `latest.yml`
  (`curl http://127.0.0.1:9100/devhub/latest.yml`), and confirm the installed
  version is *lower* than the feed version.
- **Update downloads but won't install** → look for `[DevHub Updater] update
  error` in logs; unsigned-build or AV interference are the usual suspects.
- **Old installers piling up** → policy is one active version: `rm -rf
  dist/electron/*` before every release build (see "Cleanup policy" above).
