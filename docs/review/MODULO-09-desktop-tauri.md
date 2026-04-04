# Módulo 9: Desktop Tauri — REPORTE DE REVISIÓN

> **Fecha:** Abril 2026
> **Estado:** ✅ Revisado
> **Archivos:** ~15 (config + Rust source + capabilities + wrapper script)
> **Hallazgo principal:** Permisos shell sin scope, CSP nulo, frontendDist incorrecto para producción

---

## 🔴 Hallazgos Críticos

### 1. Permisos shell sin scope (`shell:allow-execute` + `shell:allow-spawn`)

Cualquier código frontend comprometido puede ejecutar **comandos arbitrarios del sistema**. No hay allow-list de binarios permitidos.

### 2. CSP nulo (`csp: null` en `tauri.conf.json`)

Sin Content Security Policy — vulnerable a XSS que podría escalar a ejecución de comandos vía shell permissions.

### 3. `frontendDist` incorrecto para producción

```json
"frontendDist": "http://localhost:3000"
```

Esto es una URL, no un path de archivo. Para producción debería ser `"../out"` o `"../.next/standalone"`.

### 4. Path hardcodeado en wrapper script

```bash
ROOT="/home/matias/devhub"
```

El wrapper bash (`binaries/devhub-server-x86_64-unknown-linux-gnu`) tiene el path del desarrollador hardcodeado — **rompe en cualquier otra máquina**.

---

## 🐛 Bugs y Issues

| Bug                                                         | Archivo                     | Severidad |
| ----------------------------------------------------------- | --------------------------- | --------- |
| `frontendDist` es URL en vez de path para producción        | `tauri.conf.json`           | 🔴 Alta   |
| Path hardcodeado `/home/matias/devhub` en wrapper           | `binaries/devhub-server`    | 🔴 Alta   |
| `tauri-plugin-notification` declarado pero nunca usado      | `Cargo.toml`                | 🟢 Baja   |
| `tauri-plugin-dialog` declarado pero sin commands de dialog | `Cargo.toml` + `lib.rs`     | 🟢 Baja   |
| `is_sidecar_running()` muy permisivo (match "node")         | `lib.rs`                    | 🟡 Media  |
| Posible conflicto de puerto 3000 (Tauri + wrapper)          | `tauri.conf.json` + wrapper | 🟡 Media  |
| `resources/standalone.zip` referenciado pero no existe      | `tauri.conf.json`           | 🟡 Media  |
| `rust-version: 1.77.2` puede ser viejo                      | `Cargo.toml`                | 🟢 Baja   |
| Deb dependencies `libwebkit2gtk-4.1-0` puede variar en Kali | `tauri.conf.json`           | 🟡 Media  |

---

## 🏗️ Arquitectura

### Plugins de Tauri

| Plugin                      | Usado?          | Notas                                      |
| --------------------------- | --------------- | ------------------------------------------ |
| `tauri-plugin-shell`        | ✅              | Ejecuta sidecar, shell access              |
| `tauri-plugin-log`          | ✅ (solo debug) | Logging                                    |
| `tauri-plugin-notification` | ❌              | Declarado pero nunca usado                 |
| `tauri-plugin-dialog`       | ⚠️              | Declarado e inicializado pero sin commands |
| `sysinfo`                   | ✅              | Gestión de procesos                        |
| `dirs`                      | ✅              | Home directory                             |

### Capabilities

| Permiso                       | Risk     | Notas                                     |
| ----------------------------- | -------- | ----------------------------------------- |
| `core:default`                | ✅ Bajo  | Básico                                    |
| `core:tray:default`           | ✅ Bajo  | System tray                               |
| `core:window:allow-hide/show` | ✅ Bajo  | Background mode                           |
| `shell:allow-execute`         | 🔴 Alto  | **Sin scope** — ejecuta cualquier comando |
| `shell:allow-spawn`           | 🔴 Alto  | **Sin scope** — spawnea cualquier proceso |
| `shell:allow-kill`            | 🟡 Medio | Mata procesos                             |
| `shell:allow-open`            | 🟡 Medio | Abre archivos/URLs                        |

### Custom Tauri Commands

**Cero.** No hay `#[tauri::command]` macros. Todo el manejo es via `app.run()` event loop.

---

## 🗑️ Archivos candidatos a eliminación/reducción

| Archivo                                           | Acción                      | Razón                                   |
| ------------------------------------------------- | --------------------------- | --------------------------------------- |
| `Cargo.toml` → `tauri-plugin-notification`        | Eliminar                    | Nunca usado                             |
| `binaries/devhub-server-x86_64-unknown-linux-gnu` | Refactorizar                | Path hardcodeado, necesita ser dinámico |
| `resources/standalone.zip`                        | Crear o eliminar referencia | No existe                               |

## 🔧 Fixes recomendados

### Prioridad 1 — Seguridad

1. **Agregar scope** a `shell:allow-execute` — restrict a binarios específicos
2. **Agregar CSP** en `tauri.conf.json` — al menos `default-src 'self'`
3. **Fix** `frontendDist` para producción — path de archivo, no URL

### Prioridad 2 — Bugs

4. **Eliminar** path hardcodeado del wrapper script — usar `dirname` relativo
5. **Eliminar** `tauri-plugin-notification` de `Cargo.toml`
6. **Resolver** conflicto de puerto 3000 entre Tauri y wrapper
7. **Agregar** `allow` scope a `shell:allow-spawn`

### Prioridad 3 — Limpieza

8. **Eliminar** referencia a `resources/standalone.zip` si no existe
9. **Actualizar** `rust-version` si es necesario
10. **Verificar** compatibilidad de `libwebkit2gtk` con Kali Rolling
