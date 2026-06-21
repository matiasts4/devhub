# Causa 1 — `next-server` zombie en puerto 3400

## Problema

DevHub empaquetado sirve la UI desde Next.js standalone en `http://127.0.0.1:3400` (`frontendDist` en `tauri.conf.json`). Si un proceso previo queda escuchando en ese puerto pero **no responde HTTP**, WebKitGTK muestra **"This page couldn't load"** al intentar cargar APIs o recargar la SPA.

El caso observado: un `next-server` llevaba ~1 h en `:3400`, aceptaba conexiones TCP y **curl hacía timeout** (sin status code).

## Por qué el cleanup anterior no lo mataba

El wrapper/sidecar filtraba procesos por cmdline buscando strings como `devhub`. En Linux, `next-server` aparece truncado:

```text
next-server (v16.2.6)
```

Sin path ni nombre `devhub` → el listener zombie **sobrevivía** a cada reinicio de la app.

## Síntomas

- Pantalla WebKit nativa: **"This page couldn't load"** + Reload / Back
- Al seleccionar un proyecto (necesita `/api/db/*`, etc.)
- A veces el hub parecía cargar si la WebView tenía shell en caché, pero cualquier fetch fallaba
- `curl http://127.0.0.1:3400/` → timeout o sin respuesta en &lt;5s

## Cómo se detectó

```bash
# ¿Hay listener?
ss -tlnp | grep ':3400'

# ¿Responde HTTP?
curl -s --max-time 5 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3400/
# → 000 o timeout = zombie

# Cmdline del PID (truncada)
cat /proc/<PID>/cmdline | tr '\0' ' '
# → next-server (v16.x)
```

## Corrección

**Rust (`src-tauri/src/lib.rs`):**

- `is_devhub_reserved_port(port)` — en release, `:3400` (Next) y `:4000`/sidecar son reservados DevHub
- `kill_listeners_on_port(port)` — mata cualquier listener en puerto reservado aunque la cmdline no mencione `devhub`
- `reclaim_hung_nextjs_listener()` — llamado al inicio de `ensure_runtime_ready` antes de spawnear sidecar

**Wrapper (`packaging/linux/devhub-server`):**

- Misma lógica de `kill_listeners_on_port` para `:3400` y `:4000` al arrancar

**Build/deploy:**

- `scripts/tauri-cli.cjs` — sincroniza wrapper antes del build
- `scripts/patch-installed-devhub.sh` — parche rápido sobre `.deb` ya instalado

## Fix manual inmediato (sin recompilar)

```bash
pkill -9 -x devhub 2>/dev/null || true
pkill -9 -f 'devhub-server|next-server.*3400' 2>/dev/null || true
# Si sigue ocupado el puerto:
fuser -k 3400/tcp 2>/dev/null || true

gtk-launch DevHub
```

Tras reiniciar:

```bash
curl -s --max-time 3 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3400/
# → debe ser 200
```

## Archivos

- `src-tauri/src/lib.rs`
- `packaging/linux/devhub-server`
- `scripts/tauri-cli.cjs`
- `scripts/patch-installed-devhub.sh`
