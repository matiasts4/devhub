# DevHub MCP Client Configs

Use Node 24 for this MCP on this machine because `better-sqlite3` is compiled
for Node module ABI 137.

```json
{
  "command": "/home/matias/.nvm/versions/node/v24.14.0/bin/node",
  "args": ["/home/matias/ArxonLabs/devhub/devhub-mcp/server.js"]
}
```

## OpenCode

In `opencode.json`:

```json
{
  "mcp": {
    "devhub": {
      "type": "local",
      "enabled": true,
      "command": [
        "/home/matias/.nvm/versions/node/v24.14.0/bin/node",
        "/home/matias/ArxonLabs/devhub/devhub-mcp/server.js"
      ]
    }
  }
}
```

## Codex

In `~/.codex/config.toml`:

```toml
[mcp_servers.devhub]
command = "/home/matias/.nvm/versions/node/v24.14.0/bin/node"
args = ["/home/matias/ArxonLabs/devhub/devhub-mcp/server.js"]
```

## VS Code / Windsurf style

```json
{
  "servers": {
    "devhub": {
      "type": "stdio",
      "command": "/home/matias/.nvm/versions/node/v24.14.0/bin/node",
      "args": ["/home/matias/ArxonLabs/devhub/devhub-mcp/server.js"]
    }
  }
}
```

## Hermes Agent

In `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  devhub:
    command: /home/matias/.nvm/versions/node/v24.14.0/bin/node
    args:
      - /home/matias/ArxonLabs/devhub/devhub-mcp/server.js
    enabled: true
```

## Installed on this machine

The DevHub MCP has been registered in:

- `~/.codex/config.toml`
- `~/.config/opencode/opencode.json`
- `~/opencode.json`
- `.opencode/opencode.json`
- `~/.config/Code/User/mcp.json`
- `~/.config/Kiro/User/mcp.json`
- `.kiro/settings/mcp.json`
- `~/.windsurf/mcp.json`
- `~/.config/Trae/User/mcp.json`
- `~/.gemini/antigravity/mcp_config.json`
- `~/.codeium/windsurf/mcp_config.json`
- `~/.hermes/config.yaml`
- `~/.hermes/mcp-presets.json`

Global agent instructions were also updated so agents know when to use DevHub
MCP without the user needing to say "run the MCP" every time:

- `~/.codex/engram-instructions.md`
- `~/.config/opencode/AGENTS.md`
- `~/.hermes/SOUL.md`
- repo root `AGENTS.md`
