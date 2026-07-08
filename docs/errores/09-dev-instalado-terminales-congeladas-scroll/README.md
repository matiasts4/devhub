# 09 — Instalado: terminales “pegadas” (sin scroll / sin input) con dev abierto

## Resumen

Con **DevHub instalado** en uso (Grok, OpenCode, shells) y **`tauri dev`** al mismo tiempo, al **abrir o cerrar** la app de desarrollo las terminales del **instalado** a veces:

- Dejan de **responder al scroll** (Grok y otras TUIs).
- Dejan de **actualizarse** o parecen congeladas hasta **recargar** la app entera.
- Coincide con el **cierre del sidecar de desarrollo** (`:4001`), aunque el instalado debería usar `:4000`.

**Plataforma observada:** Windows (misma lógica de puertos en Linux).

**Relacionado:** [08-dev-instalado-coexistencia-terminales](../08-dev-instalado-coexistencia-terminales/README.md).

---

## Síntomas (lo que reportaste)

| Qué ves                             | Qué implica                                                         |
| ----------------------------------- | ------------------------------------------------------------------- |
| Scroll muerto en Grok / TUIs        | Input o rueda ya no llega al PTY, o xterm quedó sin renderer activo |
| A veces aún “se ve” salida antigua  | WebSocket cortado pero canvas no repintado / sin reconexión         |
| Solo se arregla con reload completo | No hay auto-reconnect en paneles visibles                           |
| Empeora al cerrar dev               | Sidecar dev o señal de shutdown afectó el runtime del instalado     |

---

## Causas raíz (investigación)

### A — Mismo sidecar PTY (`:4000`) para dev e instalado

Si el frontend de **dev** obtiene `port: 4000` en `/api/terminal/session` (instalado con sidecar vivo en 4000), **dev e instalado comparten sesiones** (`sessionId` = id de panel). Al cerrar dev:

- `POST /shutdown` o `taskkill` del proceso en **4000** mata **todos** los PTY del instalado.
- Los WebSocket del instalado se cortan.

**Mitigación en repo:** `readSidecarPortForTerminalSession()` — dev **solo** `:4001`.

**Comprobar en instalado:** logs de sesión deben mostrar `ws://127.0.0.1:4000/...`, en dev `4001` (o TTY local).

### B — Shutdown de dev apuntando al sidecar de producción

Al salir de `tauri dev`, Rust llama `shutdown_sidecar()`. Si `~/.devhub-dev/sidecar-port.txt` decía `4000` o el PID era el proceso de **prod**, se enviaba `POST http://127.0.0.1:4000/shutdown` → el sidecar de prod ejecuta shutdown global y **mata todos los PTY**.

**Mitigaciones:** guards de puerto/PID en `lib.rs`; header `X-Devhub-Shutdown-Port` en sidecar (`403` si no coincide).

### C — WebSocket caído sin reconexión en paneles visibles

`useTerminalAutoReconnect` solo reconectaba si `autoFocus === true`. Paneles **visibles pero no activos** quedaban en `disconnected` → scroll/input rotos aunque el sidecar de prod siguiera vivo.

**Mitigación:** auto-reconnect también si `isVisibleInLayout`.

### D — xterm / WebGL tras cierre brusco

Errores `onRequestRedraw` al dispose; canvas congelado con WS muerto. Tratados como stale + reconexión + repintado en otros fixes de terminal.

### E — No es “Rajoy” / pizarra sola

La pizarra y `shared-surface-host-resize` **agraván** reflows, pero el patrón **dev abierto + cierre sidecar dev → instalado roto** apunta a **runtime PTY compartido o shutdown cruzado**, no solo UI.

---

## Mapa de diagnóstico

```text
Instalado: scroll/input muertos tras cerrar tauri dev
    │
    ├─ ¿session API en dev devolvía port 4000?
    │     └─ Sí → causa A; actualizar repo + reiniciar dev
    │
    ├─ ¿Sidecar prod sigue vivo?
    │     curl http://127.0.0.1:4000/health
    │     ├─ falla → prod sidecar murió (B o A) → reiniciar app instalada
    │     └─ OK → causa C (reconnect) o D (xterm)
    │
    ├─ node scripts/devhub-runtime-doctor.cjs
    │     :4000 LISTENING + :4001 solo con dev abierto
    │
    └─ Logs Tauri dev al cerrar:
          "Ignorando shutdown … coexistencia" = bien
          "Solicitando shutdown … PID" en prod = mal (marcadores ~/.devhub-dev)
```

---

## Separación recomendada (operativa)

| Recurso     | Instalado   | Desarrollo (`tauri dev`)                        |
| ----------- | ----------- | ----------------------------------------------- |
| Next        | `:3400`     | `:3100`                                         |
| Sidecar PTY | `:4000`     | `:4001`                                         |
| Estado      | `~/.devhub` | `~/.devhub-dev`                                 |
| Lanzar dev  | —           | `pnpm tauri dev` (no `next dev` suelto sin env) |

Antes de mezclar de nuevo:

```powershell
Remove-Item -Force "$env:USERPROFILE\.devhub-dev\sidecar.pid","$env:USERPROFILE\.devhub-dev\sidecar-port.txt" -ErrorAction SilentlyContinue
node scripts/devhub-runtime-doctor.cjs
```

---

## Correcciones en código (esta ronda)

| Archivo                                                    | Cambio                               |
| ---------------------------------------------------------- | ------------------------------------ |
| `readSidecarPortForTerminalSession`                        | Dev nunca usa `:4000`                |
| `lib.rs` + `sidecar-backend/server.js`                     | Shutdown con header de puerto        |
| `shouldAutoReconnectTerminal` + `useTerminalAutoReconnect` | Reconnect si panel visible           |
| `08` / `09` docs                                           | Coexistencia y terminales congeladas |

**Despliegue:** reinstalar NSIS **y** volver a compilar `tauri dev` para que prod y dev lleven sidecar + Rust actualizados.

---

## Ver también

- [files-changed.md](./files-changed.md)
