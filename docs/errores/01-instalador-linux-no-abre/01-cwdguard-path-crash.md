# Causa 1 — sessionCwd.js importaba una ruta que no existía en el paquete

## Problema

`sidecar-backend/sessionCwd.js` tenía:

```javascript
const { resolveTerminalSpawnCwd } = require('../src/lib/terminal/cwdGuard.js');
```

En el **árbol fuente** la estructura es:

```
devhub/
├── sidecar-backend/
│   └── sessionCwd.js      ← require('../src/lib/terminal/cwdGuard.js')
└── src/
    └── lib/
        └── terminal/
            └── cwdGuard.js ← existe aquí
```

En el **paquete instalado** la estructura es:

```
/usr/lib/DevHub/_up_/sidecar-backend/
└── sessionCwd.js          ← sigue buscando ../src/lib/terminal/cwdGuard.js
                              ↑ NO EXISTE — no hay src/ arriba de _up_/
```

Entonces Node.js lanzaba:

```
Error: Cannot find module '../src/lib/terminal/cwdGuard.js'
```

Esto ocurría **antes** de que `server.listen(4000)` se ejecutara — el sidecar moría en el require, sin nunca abrir el puerto. La app no podía conectar al sidecar en `127.0.0.1:4000`.

## Cómo se detectó

```bash
# Reproducción directa desde el directorio del sidecar en el sistema instalado
cd /usr/lib/DevHub/_up_/sidecar-backend
NODE_PATH="$HOME/.devhub/standalone/node_modules" SIDECAR_PORT=4000 /usr/bin/node server.js
# → Error: Cannot find module '../src/lib/terminal/cwdGuard.js'
```

## Corrección

Se creó `sidecar-backend/cwdGuard.js` con el contenido completo del helper (163 líneas), y se cambió el import en `sessionCwd.js`:

```javascript
// Antes (roto)
const { resolveTerminalSpawnCwd } = require('../src/lib/terminal/cwdGuard.js');

// Después (corregido)
const { resolveTerminalSpawnCwd } = require('./cwdGuard.js');
```

El nuevo archivo `cwdGuard.js` exporta:

- `normalizeCwd(candidate)`
- `isUsableDirectory(candidate, { fsImpl })`
- `isDevHubWorktreePath(cwdPath)`
- `isPlyriumWorktreePath(cwdPath)`
- `validateSwarmCwd({ requestedCwd, roleKey, isSwarmRole, fsImpl })`
- `resolveTerminalSpawnCwd(requestedCwd, { fsImpl, processCwd, homeDir })`

Usa únicamente módulos built-in de Node.js (`fs`, `os`, `path`) — no necesita dependencias externas.

## Verificación

```bash
node ./node_modules/jest/bin/jest.js tests/unit/sidecar-cwd-guard.test.js --no-coverage
# PASS — 4/4 tests
```

## Archivo

- `sidecar-backend/sessionCwd.js` — require corregido
- `sidecar-backend/cwdGuard.js` — nuevo