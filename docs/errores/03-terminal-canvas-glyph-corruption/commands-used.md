# Comandos y señales — debugging terminal TUI corruption

## Reproducción

```bash
# Cerrar todas las instancias DevHub primero (protocolo TERM-01)

# Desarrollo web (baseline — suele fallar menos)
npm run dev
# → http://localhost:3100

# Tauri dev (más cercano a producción)
npm run tauri:dev

# App instalada
# DevHub_0.1.1_amd64.deb desde src-tauri/target/release/bundle/deb/

# En panel terminal:
opencode --session ses_abc
# o
grok
```

## Build desktop (contexto sesiones previas)

```bash
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig npm run tauri:build
```

## Logs

```bash
# Limpiar antes de repro (opcional)
mv data/logs/terminal-debug.log data/logs/terminal-debug.log.bak

# Seguir en vivo
tail -f data/logs/terminal-debug.log
```

### Tags útiles en `terminal-debug.log`

| Tag / msg                                | Significado                           |
| ---------------------------------------- | ------------------------------------- |
| `RENDER:* canvas-released`               | Canvas addon liberado (hide/inactive) |
| `RENDER:* canvas-attached`               | Canvas reattach tras show             |
| `RENDER:* webgl-released-inactive-panel` | WebGL liberado en split inactivo      |
| `fit-skipped` / `zeroSized: true`        | Viewport aún sin tamaño válido        |
| `fit-resize` / `reactivate-settled`      | Resize coherente post-show            |
| `workspace-show-*`                       | Burst de sync al mostrar workspace    |
| `opencode-ready-notified`                | Footer OpenCode detectado             |
| `WS_CLOSE` / `PTY_EXIT`                  | Problema de transporte, no renderer   |

## Tests relacionados

```bash
npm test -- --testPathPattern="TerminalTTY|terminalNoiseFilter|terminalRendererCapabilities"
```

## Inspección git (estado al documentar)

```bash
git status --short
git diff --stat src/components/TerminalTTY.jsx src/lib/terminal/terminalNoiseFilter.js
git log --oneline -5
```
