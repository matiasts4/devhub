# Integración de Headroom en el flujo de trabajo

> Fecha: 2026-06-28  
> Headroom versión: 0.27.0  
> Proxy: `http://127.0.0.1:8787`

## ¿Qué es Headroom?

[Headroom](https://github.com/headroomlabs-ai/headroom) es una capa local de compresión de contexto para agentes de IA. Se pone entre las herramientas (Claude Code, Codex, OpenCode, Kimi, etc.) y los proveedores de LLM para reducir 60–95 % de tokens en tool outputs, logs, resultados de búsqueda, archivos y chunks RAG, manteniendo la misma calidad de respuesta.

Modos de uso principales:

- **Proxy** (`headroom proxy`): intercepta todo el tráfico OpenAI/Anthropic-compatible.
- **MCP server** (`headroom mcp serve`): expone las herramientas `headroom_compress`, `headroom_retrieve` y `headroom_stats` para que cualquier cliente MCP las use.
- **Wrapper** (`headroom wrap <tool>`): configura automáticamente algunas CLI (no disponible para OpenCode en v0.27.0).

## Estado de la integración

| Herramienta    | Modo integrado              | Detalle                                                                                                                                                    |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kimi Code**  | MCP server                  | Agregado a `~/.kimi-code/mcp.json`. Las herramientas de Headroom aparecen como `mcp__headroom__headroom_compress`, etc.                                    |
| **OpenCode**   | MCP server + proxy provider | Agregado a `~/.config/opencode/opencode.json`: provider `headroom` vía `@ai-sdk/openai-compatible` en `http://127.0.0.1:8787/v1`, más el MCP server.       |
| **Grok / xAI** | Limitado                    | No hay soporte nativo de Headroom para xAI como upstream. Se puede seguir usando Grok como modelo nativo y aprovechar Headroom MCP para compresión manual. |

## Instalación realizada

```powershell
pip install "headroom-ai[mcp,proxy]"
npm install -g @ai-sdk/openai-compatible
```

Binario disponible en:

```text
C:/Users/PC/AppData/Local/Programs/Python/Python311/Scripts/headroom.exe
```

## Configuración de Kimi Code

Archivo editado: `~/.kimi-code/mcp.json`

```json
{
  "mcpServers": {
    "...": { ... },
    "headroom": {
      "command": "C:/Users/PC/AppData/Local/Programs/Python/Python311/Scripts/headroom.exe",
      "args": ["mcp", "serve"],
      "enabled": true
    }
  }
}
```

Reinicia Kimi Code para que cargue el servidor MCP. Verás disponibles:

- `mcp__headroom__headroom_compress`
- `mcp__headroom__headroom_retrieve`
- `mcp__headroom__headroom_stats`

> Nota: el MCP server necesita que el proxy de Headroom esté corriendo en `http://127.0.0.1:8787`.

## Configuración de OpenCode

Archivo editado: `~/.config/opencode/opencode.json`

### Provider headroom (para modelos Anthropic/OpenAI)

```json
{
  "provider": {
    "headroom": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Headroom Proxy",
      "options": {
        "baseURL": "http://127.0.0.1:8787/v1"
      },
      "models": {
        "claude-sonnet-4-6": {
          "name": "Claude Sonnet 4.6 (via Headroom)",
          "limit": { "context": 200000, "output": 16384 }
        },
        "claude-opus-4-6": {
          "name": "Claude Opus 4.6 (via Headroom)",
          "limit": { "context": 200000, "output": 16384 }
        },
        "gpt-4o": {
          "name": "GPT-4o (via Headroom)",
          "limit": { "context": 128000, "output": 16384 }
        },
        "gpt-4.1": {
          "name": "GPT-4.1 (via Headroom)",
          "limit": { "context": 1048576, "output": 32768 }
        }
      }
    }
  }
}
```

Para usar un modelo a través del proxy, selecciona en OpenCode:

```text
headroom/claude-sonnet-4-6
```

### MCP server

```json
{
  "mcp": {
    "...": { ... },
    "headroom": {
      "type": "local",
      "command": [
        "C:/Users/PC/AppData/Local/Programs/Python/Python311/Scripts/headroom.exe",
        "mcp",
        "serve"
      ],
      "enabled": true
    }
  }
}
```

> `headroom wrap opencode` **no existe** en Headroom v0.27.0, así que la configuración manual del provider es el camino estable.

## Notas sobre Grok / xAI

Headroom v0.27.0 no incluye xAI como upstream soportado de forma nativa. Los upstreams disponibles son:

- Anthropic (`/v1/messages`)
- OpenAI (`/v1/chat/completions`, `/v1/responses`)
- Gemini / Cloud Code / Vertex AI

**Opciones para usar Grok con Headroom:**

1. **Modelo nativo + MCP de Headroom**: deja Grok como modelo nativo en OpenCode/Kimi y usa `headroom_compress` / `headroom_retrieve` manualmente sobre tool outputs grandes.
2. **Proxy indirecto (experimental)**: Headroom tiene backend `litellm` que podría rutear a xAI a través de LiteLLM. Esto cambiaría el backend global del proxy y no está configurado aquí por ser experimental.
3. **Esperar soporte oficial**: el proyecto headroomlabs-ai/headroom no lista aún xAI en su matriz de providers.

## Gestión del proxy

Se configuró una **tarea programada de Windows** para que el proxy se inicie automáticamente al iniciar sesión.

- Nombre de la tarea: `Headroom Proxy AutoStart`
- Script: `C:/Users/PC/.headroom/scripts/start-headroom-proxy.ps1`
- Logs: `C:/Users/PC/.headroom/logs/`
  - `start-proxy.log` — arranque y verificación del script
  - `proxy.log` — salida del proxy
  - `proxy.err` — errores del proxy

### Verificar que está corriendo

```powershell
curl http://127.0.0.1:8787/health
headroom doctor
```

### Iniciar manualmente (si la tarea no lo hizo)

```powershell
powershell.exe -ExecutionPolicy Bypass -File "C:/Users/PC/.headroom/scripts/start-headroom-proxy.ps1"
```

O desde el Administrador de tareas programadas:

```powershell
Start-ScheduledTask -TaskName 'Headroom Proxy AutoStart'
```

### Detener

```powershell
netstat -ano | findstr 8787
taskkill /PID <PID> /F
```

### Deshabilitar el inicio automático

Si en algún momento no quieres que se inicie solo:

```powershell
Disable-ScheduledTask -TaskName 'Headroom Proxy AutoStart'
```

Para volver a habilitarlo:

```powershell
Enable-ScheduledTask -TaskName 'Headroom Proxy AutoStart'
```

## Verificación realizada

- [x] `headroom --version` → `0.27.0`
- [x] `headroom doctor` → proxy running at `http://127.0.0.1:8787`
- [x] `headroom mcp serve` responde correctamente al handshake MCP (`initialize`)
- [x] `~/.kimi-code/mcp.json` actualizado
- [x] `~/.config/opencode/opencode.json` actualizado (provider + MCP)
- [x] `@ai-sdk/openai-compatible` instalado globalmente

## Próximos pasos sugeridos

1. Reiniciar Kimi Code y OpenCode para que carguen los nuevos servidores MCP.
2. Probar una conversación con un modelo `headroom/*` en OpenCode.
3. Monitorear ahorros con `headroom stats` o `headroom dashboard`.
4. Si usas Claude Code o Codex, ejecutar `headroom wrap claude` / `headroom wrap codex` para envolver esas CLI automáticamente.
5. Evaluar si configuras variables de entorno `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` para que el proxy las reenvíe al upstream.
