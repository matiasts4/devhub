# Causa 2 — Node 22 vs Node 24: ABI mismatch en el launcher

## Problema

El sistema tenía dos versiones de Node.js:

|binary|version|ABI|
|---|---|---|
|`/usr/bin/node`|v22.22.1|127|
|`/home/matias/.nvm/versions/node/v24.14.0/bin/node`|v24.14.0|137|

Los nativos de `better-sqlite3` y `node-pty` dentro de `standalone.zip` estaban compilados para **Node 24 (ABI 137)**.

El `devhub-server` (sidecar wrapper) intentaba resolver Node así:

```bash
preferred_node=$(command -v node)  # → /usr/bin/node (v22.22.1) en sesión no-interactive
```

Entonces fallaba con:

```
Error: Cannot find module '/home/matias/.devhub/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
Module did not self-register
```

O directamente con "Module did not self-register" si encontraba el `.node` pero la ABI no matcheaba.

## Por qué funcionaba en dev mode

En dev mode el usuario abría la terminal manualmente — `.zshrc` sourceaba `nvm.sh` y hacía `nvm use default` → Node 24 activo → los nativos de ABI 137 funcionaban.

## Por qué fallaba desde el launcher

`gtk-launch DevHub.desktop` y los gestos del gestor de aplicaciones invocan el proceso en una **sesión bash no-interactiva**. En ese contexto:

- `~/.zshrc` **no** se ejecuta
- `NVM_DIR` / `nvm use` **no** se ejecutan
- `command -v node` resuelve al `/usr/bin/node` del sistema (v22)

## Corrección

`packaging/linux/devhub-launcher` (copiado a `/usr/lib/DevHub/bin/devhub-launcher`):

```bash
# 1. Sourcea NVM si existe
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
    nvm use --silent default >/dev/null 2>&1 || true
fi

# 2. Resuelve y exporta
ACTIVE_NODE_BIN=$(command -v node 2>/dev/null || true)
export DEVHUB_NODE_BIN="$ACTIVE_NODE_BIN"
export DEVHUB_NPM_BIN=$(command -v npm 2>/dev/null || true)

# 3. Si el Node resuelto es >= 24, marca la flag
if [ -x "$DEVHUB_NODE_BIN" ]; then
    _node_version=$("$DEVHUB_NODE_BIN" --version 2>/dev/null || true)
    case "$_node_version" in
        v24.*|v25.*|v26.*)
            export DEVHUB_ALLOW_NODE24=1
            ;;
    esac
fi

# 4. Exec al binario del desktop (NO al sidecar)
exec "$DEVHUB_APP_ELF" "$@"
```

Y en `src-tauri/src/lib.rs`, el `spawn_sidecar()` ahora reenvía:

```rust
.env("DEVHUB_NODE_BIN", std::env::var("DEVHUB_NODE_BIN").unwrap_or_default())
.env("DEVHUB_NPM_BIN", std::env::var("DEVHUB_NPM_BIN").unwrap_or_default())
.env("DEVHUB_ALLOW_NODE24", std::env::var("DEVHUB_ALLOW_NODE24").unwrap_or_default())
```

Dentro del sidecar wrapper, `select_runtime_node_bin()` interpreta `DEVHUB_ALLOW_NODE24=1` como señal de que debe usar el Node 24 resuelto por el launcher, no hacer su propia búsqueda.

## Verificación

```bash
# El proceso del sidecar debe mostrar Node 24
cat /proc/$(cat ~/.devhub/sidecar.pid)/environ | tr '\0' '\n' | grep NODE
# DEVHUB_NODE_BIN=/home/matias/.nvm/versions/node/v24.14.0/bin/node
# DEVHUB_ALLOW_NODE24=1

node ./node_modules/jest/bin/jest.js tests/unit/native-runtime-integration.test.js --no-coverage
# PASS — 8/8 tests
```

## Archivo

- `packaging/linux/devhub-launcher`
- `src-tauri/src/lib.rs` (env forwarding en `spawn_sidecar()`)