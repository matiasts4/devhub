# Archivos modificados

## Resumen

| Archivo | Tipo | Cambio |
|---|---|---|
| `sidecar-backend/sessionCwd.js` | Modificado | Require path corregido |
| `sidecar-backend/cwdGuard.js` | **Nuevo** | 163 líneas, lógica de validación de cwd |
| `src-tauri/src/lib.rs` | Modificado | Stdio decoupling + env forwarding |
| `src/lib/db/shared.js` | Modificado | Integrity gates en 3 puntos |
| `src/lib/db/shared-integrity.test.js` | **Nuevo** | 10 tests de regresión DB |
| `tests/unit/sidecar-cwd-guard.test.js` | **Nuevo** | 4 tests de regresión cwd |
| `packaging/linux/devhub-launcher` | **Nuevo** | Launcher NVM-aware para desktop |
| `packaging/linux/DevHub.desktop` | **Nuevo** | Desktop entry para el launcher |
| `src-tauri/tauri.conf.json` | Modificado | Eliminados campos inválidos |

---

## `sidecar-backend/sessionCwd.js`

**antes:**
```javascript
const { resolveTerminalSpawnCwd } = require('../src/lib/terminal/cwdGuard.js');
```

**después:**
```javascript
const { resolveTerminalSpawnCwd } = require('./cwdGuard.js');
```

Solo cambió una línea. El crash ocurría porque `../src/lib/terminal/` no existe en el directorio `_up_/sidecar-backend` del paquete.

---

## `sidecar-backend/cwdGuard.js`

**Nuevo archivo** — 163 líneas.

Funciones exportadas:

- `normalizeCwd(candidate)` — resolve y normaliza una ruta a absoluta
- `isUsableDirectory(candidate, { fsImpl })` — verifica que exista y sea directorios
- `isDevHubWorktreePath(cwdPath)` — detecta si es un worktree DevHub/Gentleman
- `isPlyriumWorktreePath(cwdPath)` — detecta si es un worktree Plyrium
- `validateSwarmCwd({ requestedCwd, roleKey, isSwarmRole, fsImpl })` — validación por rol Swarm
- `resolveTerminalSpawnCwd(requestedCwd, { fsImpl, processCwd, homeDir })` — punto de entrada principal

Solo usa módulos built-in de Node (`fs`, `os`, `path`).

---

## `src-tauri/src/lib.rs`

Dos cambios independientes:

**Cambio 1 — Stdio decoupling**

Todas las llamadas a `println!` y `eprintln!` fueron reemplazadas por `log::info!`, `log::warn!`, `log::error!`.

Principales ubicaciones:
- `wait_for_nextjs_ready()` — logs de espera y éxito/fallo de Next.js
- event loop del sidecar (líneas ~521-535) — stdout/stderr forwarding
- callback de single-instance — "Segunda instancia detectada"
- `RunEvent::Exit` — logs de cierre

**Cambio 2 — Env forwarding al sidecar**

En `spawn_sidecar()`, ahora reenvía:

```rust
.env("DEVHUB_NODE_BIN", std::env::var("DEVHUB_NODE_BIN").unwrap_or_default())
.env("DEVHUB_NPM_BIN", std::env::var("DEVHUB_NPM_BIN").unwrap_or_default())
.env("DEVHUB_ALLOW_NODE24", std::env::var("DEVHUB_ALLOW_NODE24").unwrap_or_default())
```

Esto permite que el proceso del sidecar use el mismo Node 24 que el launcher resolvió, sin necesidad de volver a hacer su propia detección.

---

## `src/lib/db/shared.js`

Tres cambios:

### 1. Pre-open integrity gate

```javascript
const integrity = tempDb.prepare('PRAGMA integrity_check').get();
if (integrity.integrity_check !== 'ok') {
    needsRecovery = true;
}
```

Antes usaba `SELECT count(*) FROM projects`. Eso podía pasar si la tabla `projects` estaba en páginas no dañadas — ahora `PRAGMA integrity_check` valida la DB entera.

### 2. Filtro de backups con integrity check

```javascript
const probe = new Database(backup.path, { readonly: true });
const ic = probe.prepare('PRAGMA integrity_check').get();
probe.close();
if (ic.integrity_check !== 'ok') continue; // Skip corrupt backup
```

Antes copiaba el primer backup sin validar. Ahora rechaza candidatos que no pasen `integrity_check === 'ok'`.

### 3. Post-schema safety net

```javascript
const postSchemaIntegrity = _db.prepare('PRAGMA integrity_check').get();
if (postSchemaIntegrity.integrity_check !== 'ok') {
    _db.close();
    fs.unlinkSync(DB_PATH);
    fs.unlinkSync(DB_PATH + '-wal');
    fs.unlinkSync(DB_PATH + '-shm');
    // Recreate + reapply schema
}
```

Antes no había verificación después de aplicar el schema y el WAL replay. Ahora si la DB sigue corrupta después de eso, se elimina y se crea una fresca.

---

## `src/lib/db/shared-integrity.test.js` (nuevo)

10 tests:

1. `PRAGMA integrity_check` retorna 'ok' para DB sana
2. `PRAGMA integrity_check` lanza/retorna errores para DB truncada/corrupta
3. Backup corrupto es rechazado en recovery scan filter
4. Backup válido es aceptado en recovery scan filter
5. Pre-open gate activa `needsRecovery` para DB corrupta
6. Pre-open gate acepta DB sana con `needsRecovery=false`
7. `devhub.db.pre-restore` corrupto es rechazado en recovery scan
8. `devhub.db.pre-restore` válido es aceptado en recovery scan
9. Post-schema integrity check detecta WAL-replay corruption y resetea
10. DB sana pasa pre-open gate y crea backup (no recovery)

---

## `tests/unit/sidecar-cwd-guard.test.js` (nuevo)

4 tests:

1. `.sessionCwd loads without ../src sibling path dependency` — verifica que el require local no falle
2. `falls back to process cwd when requested cwd is missing` — fallback behaviour
3. `resolveSidecarSessionCwd returns valid shape for real directory`
4. `returns /tmp unchanged when it exists` — happy path

---

## `packaging/linux/devhub-launcher` (nuevo)

Script Bash que:
1. Sourcea `~/.nvm/nvm.sh` si existe
2. Ejecuta `nvm use --silent default`
3. Resolve `DEVHUB_NODE_BIN` y `DEVHUB_NPM_BIN`
4. Si el Node resuelto es >= 24, exporta `DEVHUB_ALLOW_NODE24=1`
5. Exec al binario Tauri desktop: `exec "$DEVHUB_APP_ELF" "$@"`

Instalado a `/usr/lib/DevHub/bin/devhub-launcher` por el .deb.

---

## `packaging/linux/DevHub.desktop` (nuevo)

```desktop
[Desktop Entry]
Name=DevHub
Comment=Autonomous Development Workspace
Exec=/usr/lib/DevHub/bin/devhub-launcher %U
Icon=DevHub
Type=Application
Terminal=false
StartupNotify=true
Categories=Development;IDE;Utility;
```

Instalado a `/usr/share/applications/DevHub.desktop` por el .deb.

---

## `src-tauri/tauri.conf.json`

**Eliminado:**
- `bundle.linux.deb.desktop` — campo inexistente en Tauri v2
- `bundle.linux.binaries` — campo fuera de lugar (estaba bajo `linux`, no bajo `bundle`)

El `externalBin: ["binaries/devhub-server"]` en nivel `bundle` ya existía y sigue funcionando para instalar el sidecar wrapper.

```json
// Estado final de la sección linux
"linux": {
  "deb": {
    "depends": ["libwebkit2gtk-4.1-0", "libgtk-3-0"],
    "files": {
      "/usr/lib/DevHub/bin/devhub-launcher": "../packaging/linux/devhub-launcher",
      "/usr/share/applications/DevHub.desktop": "../packaging/linux/DevHub.desktop"
    }
  }
}
```

---

## Tests de regresión

```bash
node ./node_modules/jest/bin/jest.js tests/unit/sidecar-cwd-guard.test.js --no-coverage
# PASS 4/4

node ./node_modules/jest/bin/jest.js src/lib/db/shared-integrity.test.js --no-coverage
# PASS 10/10

node ./node_modules/jest/bin/jest.js tests/unit/native-runtime-integration.test.js --no-coverage
# PASS 8/8
```