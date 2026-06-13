# Comandos usados durante el debugging

## Detección del cwdGuard crash

```bash
# Reproducir el crash del sidecar desde el sistema instalado
cd /usr/lib/DevHub/_up_/sidecar-backend
NODE_PATH="$HOME/.devhub/standalone/node_modules" SIDECAR_PORT=4000 /usr/bin/node server.js
# → Error: Cannot find module '../src/lib/terminal/cwdGuard.js'
```

## Detección del ABI mismatch

```bash
# Ver qué Node usa el proceso del sidecar
cat /proc/$(cat ~/.devhub/sidecar.pid)/environ | tr '\0' '\n' | grep -E "NODE_BIN|NODE_VERSION"
# → DEVHUB_NODE_BIN=/usr/bin/node (v22, ABI 127) ← wrong

# Simular entorno no-interactivo del launcher
env -i HOME="$HOME" bash -lc 'command -v node; node --version'
# → /usr/bin/node, v22.22.1

# Verificar ABI del .node
node -p "process.versions.modules"
# → 137 (Node 24)

file ~/.devhub/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node
# → ELF 64-bit LSB shared object (ABI 137)
```

## Detección de stdio acoplado

```bash
# El usuario veía logs del sidecar en la terminal después de volver al prompt
# La causa era el forwarding de stdout/stderr a println! en lib.rs
# Confirmado leyendo src-tauri/src/lib.rs líneas ~521-535
grep -n "println!\|eprintln!" src-tauri/src/lib.rs | wc -l
# → 21 antes del fix
```

## Detección de corrupción SQLite

```bash
# Verificar integridad
sqlite3 ~/.devhub/data/devhub.db "PRAGMA integrity_check;"
# → *** in database main ***
#    Tree 11 page 11 cell 0: invalid page number 393

# Ver estado de la DB
sqlite3 ~/.devhub/data/devhub.db "SELECT count(*) FROM projects;"
# → 3 (la DB estaba corrupted pero la query no fallaba porque no tocaba las páginas dañadas)

# Comparar con backup
sqlite3 ~/.devhub/data/devhub.db.pre-restore "SELECT count(*) FROM projects;"
# → 0 (clean backup, sin proyectos)
```

## Detección de errores de schema en tauri.conf.json

```bash
# El build fallaba antes de compilar
npx tauri build --bundles deb 2>&1 | grep "tauri.conf.json"
# → Error "tauri.conf.json" error on bundle > linux > deb: Additional properties are not allowed ('desktop' was unexpected)

# Verificar el schema de Tauri para DebConfig
python3 -c "
import json
s = json.load(open('node_modules/@tauri-apps/cli/config.schema.json'))
deb = s['definitions']['DebConfig']['properties']
for k in deb: print(k)
"
# → changelog, conflicts, depends, desktopTemplate, files, ...
# → NO 'desktop' property
```

## Build exitoso

```bash
# Con PKG_CONFIG_PATH apuntando a las librerías del sistema
PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig:$PKG_CONFIG_PATH" \
  npx tauri build --bundles deb

# Verificar que el .deb se generó
stat src-tauri/target/release/bundle/deb/DevHub_0.1.1_amd64.deb
# → May 28 18:18:02 2026, 3812627026 bytes
```

## Reinstalación limpia

```bash
pkill -f '/usr/bin/devhub' || true
pkill -f '/usr/bin/devhub-server' || true
pkill -f 'next-server' || true

sudo dpkg -P dev-hub || true

rm -rf "$HOME/.devhub/standalone"
rm -f "$HOME/.devhub/sidecar.pid" \
      "$HOME/.devhub/sidecar-port.txt" \
      "$HOME/.devhub/sidecar-build-id.txt"

mkdir -p "$HOME/.devhub/data"
mv "$HOME/.devhub/data/devhub.db" "$HOME/.devhub/data/devhub.db.corrupt.$(date +%s)" 2>/dev/null || true
rm -f "$HOME/.devhub/data/devhub.db-wal" "$HOME/.devhub/data/devhub.db-shm"
cp "$HOME/.devhub/data/devhub.db.pre-restore" "$HOME/.devhub/data/devhub.db"

sudo dpkg -i src-tauri/target/release/bundle/deb/DevHub_0.1.1_amd64.deb

gtk-launch DevHub.desktop
```

## Verificación post-fix

```bash
# Procesos activos
ss -tlnp | grep -E ':3400|:4000'
# → 127.0.0.1:4000 (node sidecar)
# → 0.0.0.0:3400 (next-server)

# Sin logs en la terminal que abrió la app → confirmar que el fix de stdio funcionó

# DB sana
sqlite3 ~/.devhub/data/devhub.db "PRAGMA integrity_check;"
# → ok

# Tests
node ./node_modules/jest/bin/jest.js tests/unit/sidecar-cwd-guard.test.js --no-coverage
node ./node_modules/jest/bin/jest.js src/lib/db/shared-integrity.test.js --no-coverage
```