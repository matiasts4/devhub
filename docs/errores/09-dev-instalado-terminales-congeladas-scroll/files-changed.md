# Archivos — 09 terminales instalado congeladas

| Archivo                                                     | Rol                                              |
| ----------------------------------------------------------- | ------------------------------------------------ |
| `src/lib/devhub/sidecarRuntime.js`                          | `readSidecarPortForTerminalSession`              |
| `src/app/api/terminal/session/route.js`                     | Usa puerto dev/prod aislado                      |
| `src-tauri/src/lib.rs`                                      | Shutdown con header; guards PID/puerto           |
| `sidecar-backend/server.js`                                 | `POST /shutdown` valida `X-Devhub-Shutdown-Port` |
| `src/components/terminal/TerminalTTY.helpers.js`            | Reconnect si visible                             |
| `src/components/terminal/hooks/useTerminalAutoReconnect.js` | Lee `isVisibleInLayoutRef`                       |
| `packaging/devhub-server.cjs`                               | Coexistencia pre-kill / layout dev               |
| `scripts/next-dev.cjs`, `tauri-cli.cjs`                     | Env dev + heap                                   |
