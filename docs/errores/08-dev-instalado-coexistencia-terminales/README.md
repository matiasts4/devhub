# 08 — Al lanzar `tauri dev`, se caen las terminales (o el backend) de la app instalada

## Resumen

Con **DevHub instalado** (NSIS / `.deb`, puertos **3400** + **4000**) abierto y terminales en uso, al arrancar el entorno de **desarrollo** (`pnpm run tauri:dev`) las terminales del instalado **se cerraban** o dejaban de responder. La ventana del instalado a veces seguía visible, pero el **PTY sidecar de producción** había sido terminado.

**Estado:** **Resuelto** en repo (2026-07-07, ampliado mismo día) — ver causas 1–3 y pasos de despliegue abajo.

**Plataformas:** Windows y Linux (misma lógica del wrapper Node).

**Relacionado:** [18_Guia_Empaquetado_Desktop.md](../../18_Guia_Empaquetado_Desktop.md) (sección D, puertos dev vs prod), [05-deb-webkit-page-couldnt-load](../05-deb-webkit-page-couldnt-load/README.md) (kills en :3400).

---

## Síntoma

| Paso | Qué ve el usuario                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | App **instalada** corriendo con terminales activas (OpenCode, Grok, shell, etc.).                                                                 |
| 2    | En el repo, `pnpm run tauri:dev` (o `tauri dev` con env correcto).                                                                                |
| 3    | Las terminales del **instalado** se cierran o quedan en negro / desconectadas; a veces también falla el hub del instalado hasta reiniciar DevHub. |

**Esperado:** coexistencia — dev en **3100** (Next) + **4001** (PTY), instalado en **3400** + **4000**, sin interferencia.

---

## Causas raíz

### 1 — Wrapper Node mal clasificado (principal)

El wrapper `packaging/devhub-server.cjs` decide si está en **modo instalado** buscando `standalone.zip` junto al script en el bundle de **debug**.

En **`tauri dev`**, el bundle de debug incluye `standalone.zip` (del último `tauri:build`). El wrapper entonces podía:

1. Marcar `isSystemInstall = 1` y `devLayout = false`.
2. Usar **`~/.devhub`** en lugar de **`~/.devhub-dev`**.
3. Ejecutar **pre-kill** en **:3400** y **:4000** (`taskkill /T` en Windows).
4. Levantar Next standalone en **:3400**, compitiendo con el instalado.

Tauri ya pasaba `DEVHUB_RUNTIME=development`, `SIDECAR_PORT=4001`, `DEVHUB_HOME=~/.devhub-dev`, pero **`detectLayout()` no lo respetaba**.

### 2 — Script empaquetado obsoleto en `tauri dev`

`scripts/tauri-cli.cjs` solo sincronizaba el wrapper al hacer **`build`**, no **`dev`**. El ejecutable `devhub-server` en `target/debug/resources/` seguía ejecutando un **`devhub-server.cjs` viejo`** aunque el repo ya tuviera el parche.

**Fix:** `scripts/sync-devhub-server-resource.cjs` + sync en `tauri dev` / `tauri-dev.cjs`.

### 3 — `shutdown_sidecar` en Rust podía apagar producción

Si en `~/.devhub-dev/sidecar-port.txt` quedaba **`4000`** (marcador de prod mezclado), `ensure_runtime_ready` → `shutdown_sidecar()` hacía `POST http://127.0.0.1:4000/shutdown` y **cerraba el PTY del instalado** (todas las terminales).

**Fix:** `shutdown_sidecar` solo actúa si `sidecar-port.txt` coincide con `sidecar_port()` del runtime actual (4001 en dev, 4000 en prod).

### 4 — Windows: `netstat` sin puerto exacto (Rust)

`listener_pids_on_port` en Windows aceptaba cualquier línea de `findstr :{port}` sin comprobar el puerto numérico (p. ej. confusión con `:40010`). Ahora filtra por puerto exacto.

### 5 — `build-id` en `tauri dev` (causa del log que reportaste)

En `check_existing_sidecar`, al arrancar **debug**, se comparaba el mtime de `standalone.zip` del bundle con `~/.devhub-dev/sidecar-build-id.txt`. Si diferían en 1 segundo:

```text
Nueva versión detectada (build-id instalado: 1783438705 / corriendo: 1783438704). Reiniciando sidecar...
Solicitando shutdown graceful del sidecar (PID 25700)...
```

Si `sidecar.pid` en dev apuntaba al **mismo PID** que el sidecar del instalado (`:4000`), se cerraban todas las terminales de producción.

**Fix:** en `cfg!(debug_assertions)` no hay comparación de build-id; antes de cualquier shutdown se exige que el PID **escuche en `sidecar_port()`** (4001 en dev).

---

## Corrección

| Capa                                             | Cambio                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `packaging/devhub-server.cjs`                    | `isPackagedDevelopmentRuntime()`, early return en `detectLayout()`, pre-kill nunca en :3400/:4000 si `SIDECAR_PORT=4001` |
| `scripts/sync-devhub-server-resource.cjs`        | Copia el `.cjs` actual a `src-tauri/resources` y `target/debug                                                           | release/resources` |
| `scripts/tauri-dev.cjs`, `scripts/tauri-cli.cjs` | Sync del recurso en **dev** y **build**                                                                                  |
| `src-tauri/src/lib.rs`                           | Sin build-id en dev; `sidecar_pid_matches_runtime`; guards en `shutdown_sidecar`; netstat Windows exacto                 |
| `scripts/tauri-cli.cjs`                          | `pnpm tauri dev` inyecta `DEVHUB_HOME=~/.devhub-dev`, `SIDECAR_PORT=4001`, etc. (igual que `tauri:dev`)                  |

Test: `tests/unit/packaging-devhub-server-layout.test.js`.

---

## ¿Hay que regenerar el instalador (NSIS / `.deb`)?

| Escenario                                                        | Acción                                                                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Probar **coexistencia** dev + instalado en tu máquina            | 1) `pnpm run tauri:dev` (recompila debug + sync del `.cjs`). **No** basta con el instalador viejo si solo corrías dev sin rebuild. |
| Instalador **release** alineado con el wrapper y Rust de release | **Sí, recomendado:** `pnpm run tauri:build` y reinstalar el `.exe` / `.deb`.                                                       |
| Solo usuarios que nunca abren `tauri dev`                        | El instalador nuevo no cambia comportamiento prod salvo el `.cjs` empaquetado actualizado.                                         |

**Checklist tras actualizar el repo:**

1. Cerrar **todas** las ventanas DevHub (instalado + dev).
2. Opcional: borrar marcadores mezclados en dev:  
   `del %USERPROFILE%\.devhub-dev\sidecar.pid` y `sidecar-port.txt` si `sidecar-port.txt` decía `4000`.
3. `pnpm run tauri:dev` (no `tauri dev` sin pasar por `tauri-dev.cjs` si querés env por defecto).
4. En `%USERPROFILE%\.devhub-dev\wrapper.log`: línea `Development runtime (coexistence)` o `dev coexistence`.
5. Con el **instalado** abierto de nuevo, repetir paso 3 y verificar que `:4000` sigue en el doctor.
6. **Regenerar instalador** e instalar encima: `pnpm run tauri:build` → `DevHub_*_x64-setup.exe`.

```bash
node scripts/devhub-runtime-doctor.cjs
node scripts/sync-devhub-server-resource.cjs   # manual si hace falta
```

---

## Mapa rápido de diagnóstico

```text
Instalado OK → lanzo tauri dev → terminales instaladas mueren
        │
        ├─ ¿Lanzaste solo `pnpm run dev` sin Tauri?
        │     └─ Otro síntoma; dev server en 3100 no debe matar 4000. Usar `pnpm run tauri:dev`.
        │
        ├─ node scripts/devhub-runtime-doctor.cjs
        │     ├─ :4000 / :3400 con LISTENING antes y desaparecen al arrancar dev → kill del wrapper (este bug).
        │     └─ ~/.devhub/sidecar-port.txt = 4001 → marcador dev en home prod; --fix-stale-port-marker
        │
        └─ ~/.devhub-dev/wrapper.log sin línea "coexistence" → wrapper antiguo; reiniciar dev / refrescar bundle debug.
```

---

## Prevención / buenas prácticas

- Desarrollo desktop: **`pnpm run tauri:dev`**, no solo Next en 3100.
- Mantener separados `~/.devhub` (instalado) y `~/.devhub-dev` (dev).
- No definir `DEVHUB_HOME=~/.devhub` en el entorno global si trabajás con `tauri dev`.
- Antes de probar un instalador nuevo tras incidentes de puertos: `node scripts/devhub-runtime-doctor.cjs`.

---

## 6 — OOM en `beforeDevCommand` (Next dev ~420 MB)

Síntoma: `FATAL ERROR: Reached heap limit` tras muchos `GET /api/agenthub/operations/health` y `POST /api/terminal/log`.

Causas: heap de Node no aplicado al proceso Next en Windows; polling cada 3–5 s a `operations/health` (ruta muy pesada); logs de terminal por HTTP en dev.

Fix: `next-dev.cjs` arranca con `node --max-old-space-size=8192`; polling swarm 20 s en dev; `POST /api/terminal/log` no-op en dev salvo `DEVHUB_TERMINAL_CLIENT_LOG=1`.

---

## Ver también

- [09 — Terminales instalado pegadas (scroll) con dev abierto](../09-dev-instalado-terminales-congeladas-scroll/README.md)
- [files-changed.md](./files-changed.md) — archivos tocados en el fix.
- [commands-used.md](./commands-used.md) — comandos de verificación (Windows/Linux).
