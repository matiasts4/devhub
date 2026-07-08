# Comandos usados — 08 dev + instalado coexistencia

## Desarrollo (recomendado)

```powershell
# Windows — desde la raíz del repo
pnpm run tauri:dev
```

```bash
# Linux
pnpm run tauri:dev
```

No usar solo `pnpm run dev` si el objetivo es la app desktop con PTY; el flujo completo es `tauri:dev`.

## Diagnóstico de puertos (Windows / Linux)

```bash
node scripts/devhub-runtime-doctor.cjs
```

Marcador de dev mezclado en home de producción (`~/.devhub/sidecar-port.txt` = `4001`):

```bash
node scripts/devhub-runtime-doctor.cjs --fix-stale-port-marker
```

Luego reiniciar la app **instalada**.

## Tests del fix

```bash
node ./node_modules/jest/bin/jest.js tests/unit/packaging-devhub-server-layout.test.js --runInBand
```

## Logs útiles

| Log                                               | Qué buscar                                |
| ------------------------------------------------- | ----------------------------------------- |
| `%USERPROFILE%\.devhub-dev\wrapper.log` (Windows) | Línea `Development runtime (coexistence)` |
| `~/.devhub-dev/wrapper.log` (Linux)               | Igual                                     |
| `%USERPROFILE%\.devhub\wrapper.log`               | Arranque del **instalado** (producción)   |

## Regenerar instalador (opcional, release)

Solo para empaquetar el `devhub-server.cjs` actualizado en el instalador; **no** es prerequisito para probar coexistencia en dev:

```bash
pnpm run tauri:build
```

Artefactos: `src-tauri/target/release/bundle/nsis/` (Windows) o `bundle/deb/` (Linux).

## Recuperación manual si prod quedó colgado (referencia doc 18)

Windows (PowerShell, adaptar según procesos visibles en el doctor):

```powershell
# Ver listeners antes de matar
node scripts/devhub-runtime-doctor.cjs
# Cerrar DevHub instalado desde la bandeja / task manager; si quedan zombies en 3400/4000, matar solo procesos DevHub/node del sidecar
```

Linux (doc 18):

```bash
pkill -9 -f 'next-server.*3400|devhub-server|node.*3400|node.*4000' || true
```

Usar con cuidado: solo cuando el doctor muestra listeners DevHub en esos puertos y la app instalada no responde.
