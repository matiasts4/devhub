# Comandos usados durante el debugging (2026-06-21)

## 1. ¿Está vivo el backend Next?

```bash
curl -s --max-time 3 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3400/
# 200 = OK
# 000 / timeout = zombie o servidor caído
```

```bash
curl -s --max-time 5 -o /dev/null -w 'health: %{http_code}\n' \
  http://127.0.0.1:3400/api/agenthub/operations/health
```

```bash
curl -s --max-time 3 -o /dev/null -w 'rewrite: %{http_code}\n' \
  http://127.0.0.1:3400/project/test/swarm
# Debe ser 200 (rewrite SPA en next.config.js)
```

## 2. ¿Quién ocupa el puerto 3400?

```bash
ss -tlnp | grep ':3400'
# o
lsof -i :3400
```

```bash
PID=$(ss -tlnp | grep ':3400' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
[ -n "$PID" ] && tr '\0' ' ' < /proc/$PID/cmdline && echo
```

## 3. Matar zombies y reiniciar app

```bash
pkill -9 -x devhub 2>/dev/null || true
pkill -9 -f 'devhub-server|next-server.*3400' 2>/dev/null || true
fuser -k 3400/tcp 2>/dev/null || true

gtk-launch DevHub
```

## 4. Instalar `.deb` reconstruido

```bash
sudo dpkg -i --force-overwrite \
  /home/matias/ArxonLabs/devhub/src-tauri/target/release/bundle/deb/DevHub_0.1.1_amd64.deb
```

Parche wrapper sin rebuild completo:

```bash
sudo bash /home/matias/ArxonLabs/devhub/scripts/patch-installed-devhub.sh
```

## 5. SQLite — proyectos vs schema

```bash
sqlite3 ~/.devhub/data/devhub.db "SELECT id, name, workspace_id FROM projects;"
```

```bash
sqlite3 ~/.devhub/data/devhub.db "PRAGMA table_info(project_members);"
# Verificar columnas invited_email, invite_token, ...
```

```bash
sqlite3 ~/.devhub/data/devhub.db "PRAGMA integrity_check;"
# → ok
```

## 6. Logs Tauri / sidecar

```bash
tail -n 100 ~/.local/share/com.devhub.desktop/logs/DevHub.log
```

Buscar:

- `Next listo pero PTY sidecar ausente`
- `Spawneando nuevo sidecar`
- `[Sidecar] Nueva sesión PTY` **al entrar al dashboard** (señal de bug Causa 3/4)

## 7. SSE Swarm (sanity check)

```bash
timeout 2 curl -s -N -H 'Accept: text/event-stream' \
  'http://127.0.0.1:3400/api/agenthub/sessions/stream' | head -5
```

## 8. Rebuild del paquete

```bash
cd /home/matias/ArxonLabs/devhub
pnpm run tauri:build
# Artefacto:
# src-tauri/target/release/bundle/deb/DevHub_0.1.1_amd64.deb
```

## 9. Test de regresión renderer Tauri Linux

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  src/components/__tests__/terminalRendererPreferences.test.js \
  -t 'demotes xterm-webgl'
```

## 10. Test migración invited_email

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  src/lib/db/core.test.js -t 'legacy project_members invite'
```
