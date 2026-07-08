# Grok SDD — DevHub

Configuración SDD de Gentle AI para este repo.

## Uso

```powershell
cd D:\devhub
grok
```

Comandos:

- `/sdd-init` — una vez por proyecto
- `/sdd-new terminal-decompose` — nuevo cambio
- `/sdd-continue` — retomar fase siguiente
- "continúa el SDD de terminal-decompose" — recupera desde Engram/OpenSpec

## Defaults de este repo

- Artifact store: **hybrid** (`openspec/changes/` + Engram)
- MCP DevHub: `devhub-mcp/server.js` (solo en este workspace)
- Ver `AGENTS.md` en la raíz del repo

## Archivos

| Archivo                                 | Rol                       |
| --------------------------------------- | ------------------------- |
| `AGENTS.md`                             | Defaults SDD + DevHub MCP |
| `.grok/config.toml`                     | MCP DevHub + subagentes   |
| `~/.grok/agents/gentle-orchestrator.md` | Orquestador SDD global    |
