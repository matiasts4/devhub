# Módulo 8: Sidecar Backend — REPORTE DE REVISIÓN

> **Fecha:** Abril 2026
> **Estado:** ✅ Revisado
> **Archivos:** 1 archivo (server.js) + package.json
> **Hallazgo principal:** El sidecar es código ORFANADO — duplica el PTY server embebido de Next.js

---

## 🔴 Hallazgo Principal: Sidecar Orfanado

El sidecar (`sidecar-backend/server.js`) y el PTY server de Next.js (`src/lib/terminal/ttyServer.js`) hacen **exactamente lo mismo**:

| Feature             | Sidecar (`server.js`)  | Next.js (`ttyServer.js`)         |
| ------------------- | ---------------------- | -------------------------------- |
| PTY spawning        | ✅ `node-pty`          | ✅ `node-pty`                    |
| WebSocket server    | ✅ `ws` en puerto 4000 | ✅ `ws` en puerto dinámico 4077+ |
| Session persistence | ✅                     | ✅                               |
| History replay      | ✅ (~10KB)             | ✅ (~100KB)                      |
| Resize support      | ✅                     | ✅                               |
| tmux integration    | ❌                     | ✅                               |
| TUI mode detection  | ❌                     | ✅                               |
| Kali MOTD filtering | ❌                     | ✅                               |

**La versión de Next.js es SUPERIOR** en todas las métricas. El sidecar es un duplicado más simple que **nadie usa** — las API routes de terminal llaman a `ensureTTYServer()` (Next.js), no al sidecar en puerto 4000.

---

## 🐛 Bugs

| Bug                                                                             | Línea | Severidad |
| ------------------------------------------------------------------------------- | ----- | --------- |
| History buffer: `totalLen` calculado una vez, nunca se recalcula tras `shift()` | 78-80 | 🔴 Alta   |
| JSON detection via `startsWith('{')` es frágil — `echo {foo}` se traga          | 168   | 🟡 Media  |
| `cwd` vacío o inexistente causa crash en `pty.spawn()`                          | 151   | 🟡 Media  |
| CORS habilitado para todos los orígenes (innecesario en 127.0.0.1)              | —     | 🟡 Media  |

---

## 🔒 Seguridad

| Issue                                                             | Severidad |
| ----------------------------------------------------------------- | --------- |
| Sin autenticación en WebSocket — acceso shell completo            | 🔴 Alta   |
| CORS `app.use(cors())` permite cualquier origen                   | 🟡 Media  |
| `cwd` del URL sin sanitizar se pasa a `pty.spawn()`               | 🟡 Media  |
| PID file en `~/.devhub/sidecar.pid` legible por cualquier proceso | 🟢 Baja   |

---

## 🗑️ Recomendación

**Eliminar el sidecar completamente.** El PTY server embebido de Next.js (`ttyServer.js`) ya hace todo lo que el sidecar hace, y más.

| Acción     | Archivo                                                |
| ---------- | ------------------------------------------------------ |
| Eliminar   | `sidecar-backend/` (completo)                          |
| Eliminar   | Referencia en Tauri wrapper (`binaries/devhub-server`) |
| Eliminar   | Dependencia `cors` del sidecar                         |
| Actualizar | Tauri `lib.rs` para no lanzar sidecar                  |
