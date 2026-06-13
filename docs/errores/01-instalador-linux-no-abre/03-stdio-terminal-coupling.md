# Causa 3 — App quedaba acoplada a la terminal via stdout/stderr heredados

## Problema

Cuando `gtk-launch DevHub.desktop` o el icono del gestor de aplicaciones lanza la app, el proceso Tauri **hereda** los file descriptors stdout (fd 1) y stderr (fd 2) del proceso padre. `Terminal=false` en el `.desktop` solo le dice al portal que no asigne una terminal TTY控制 — **no** corta los file descriptors heredados.

En `src-tauri/src/lib.rs` había 21 chiamadas a `println!` y `eprintln!`:

- Logs del ciclo de vida (`Next.js listo`, `Ventana ocultada`, etc.)
- Reenvío del stdout/stderr del sidecar:
  ```rust
  tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
      println!("[Sidecar] {}", String::from_utf8_lossy(&line));
  }
  tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
      eprintln!("[Sidecar ERR] {}", String::from_utf8_lossy(&line));
  }
  ```

Resultado: incluso después de volver al prompt de la terminal, los logs del sidecar seguían apareciendo. Cerrar la terminal enviaba `SIGHUP` al proceso Tauri (que tenía sus fd conectados a esa terminal).

## Cómo se detectó

El usuario reportó que después de abrir con `gtk-launch`, los logs del sidecar aparecían en la terminal que ejecutó el comando, incluso presionando Ctrl+C o volviendo al prompt. Cerrar esa terminal hacía que la app muriera.

Inspección de `lib.rs` confirmó que todo iba a `println!`/`eprintln!`.

## Corrección

En `src-tauri/src/lib.rs`, los 21 `println!`/`eprintln!` fueron reemplazados por `log::info!`, `log::warn!`, `log::error!`.

**Comportamiento después del fix:**

| Contexto | Plugin log activo | Logger por defecto | Efecto |
|---|---|---|---|
| `cargo run` (dev) | ✅ `tauri_plugin_log` | file + stderr | Logs visibles normalmente |
| Release (`.deb` instalado) | ❌ | **no-op** | Mensajes van a /dev/null — la app no depende del stdout heredado |

El cambio más importante fue el reenvío del stdout/stderr del sidecar:

```rust
// Antes — escribía a terminal
println!("[Sidecar] {}", String::from_utf8_lossy(&line));

// Después — log estructurado (silencioso en release)
log::info!("[Sidecar] {}", String::from_utf8_lossy(&line));
```

## Verificación

```bash
# Confirmar que no quedan println!/eprintln! en lib.rs
grep -n "println!\|eprintln!" src-tauri/src/lib.rs
# → (vacío)

# En la terminal que abrió la app: no deben aparecer logs del sidecar
# Cerrar la terminal: la app sigue corriendo
```

## Archivo

- `src-tauri/src/lib.rs`