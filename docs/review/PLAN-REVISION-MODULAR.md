# Plan de Revisión Modular — DevHub

> **Generado:** Abril 2026
> **Propósito:** Descomposición del proyecto DevHub en módulos revisables de forma independiente. Cada módulo puede ser asignado a un agente o persona diferente para auditoría de código.

---

## 📋 Resumen de Módulos

| #   | Módulo              | Sistema                           | Archivos Clave                     | Prioridad |
| --- | ------------------- | --------------------------------- | ---------------------------------- | --------- |
| 1   | Frontend Next.js    | `src/app/`                        | layout.js, page.js, providers.js   | 🔴 Alta   |
| 2   | Componentes UI      | `src/components/`                 | ~22 componentes + subdirectorios   | 🔴 Alta   |
| 3   | Vistas/Páginas      | `src/views/`                      | 15 vistas principales              | 🟡 Media  |
| 4   | API Routes          | `src/app/api/`                    | 18 sub-rutas de API                | 🔴 Alta   |
| 5   | Base de Datos Local | `src/lib/db/`                     | localDb.js, localSupabase.js       | 🔴 Alta   |
| 6   | Telegram Bot        | `telegram-bot/`                   | bot.js, 18 comandos, servicios     | 🔴 Alta   |
| 7   | MCP Server          | `devhub-mcp/`                     | server.js, jest.config.json        | 🟡 Media  |
| 8   | Sidecar Backend     | `sidecar-backend/`                | server.js                          | 🟡 Media  |
| 9   | Desktop Tauri       | `src-tauri/`                      | Cargo.toml, tauri.conf.json        | 🟢 Baja   |
| 10  | Agentes y Swarm     | `src/lib/agentRegistry*`, `docs/` | Registry, telemetría, orquestación | 🔴 Alta   |

---

## 🗺️ Mapa de Dependencias

```
┌─────────────────────────────────────────────────────────┐
│                    Desktop Tauri (#9)                    │
│         (envuelve todo, binario nativo)                  │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────▼───────────┐
         │   Frontend Next.js    │
         │      (#1, #2, #3)     │
         └───────────┬───────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
  ┌─────▼─────┐ ┌───▼────┐ ┌────▼─────┐
  │ API Routes│ │  DB    │ │ Agentes  │
  │   (#4)    │ │  (#5)  │ │  (#10)   │
  └─────┬─────┘ └───┬────┘ └────┬─────┘
        │           │           │
        │     ┌─────▼─────┐     │
        │     │ Sidecar   │◄────┘
        │     │  (#8)     │
        │     └───────────┘
        │
  ┌─────▼─────┐     ┌────────────┐
  │ MCP Server│◄───►│Telegram Bot│
  │   (#7)    │     │    (#6)    │
  └───────────┘     └────────────┘
```

---

## 📝 Instrucciones de Uso

Cada módulo tiene su propio archivo `MODULO-XX-*.md` con:

- **Alcance:** Qué archivos y carpetas cubre
- **Puntos de Revisión:** Qué verificar específicamente
- **Dependencias:** Qué otros módulos necesita entender primero
- **Riesgos Conocidos:** Problemas potenciales identificados

### Orden Recomendado de Revisión

1. **Módulo 5** (Base de Datos) — Entender cómo se persisten los datos es fundamental
2. **Módulo 10** (Agentes/Swarm) — Core de la lógica de negocio
3. **Módulo 4** (API Routes) — Cómo se exponen los datos
4. **Módulo 1** (Frontend Next.js) — Estructura de la app
5. **Módulo 2** (Componentes UI) — Implementación visual
6. **Módulo 3** (Vistas) — Páginas principales
7. **Módulo 6** (Telegram Bot) — Sistema externo integrado
8. **Módulo 7** (MCP Server) — Protocolo de herramientas
9. **Módulo 8** (Sidecar Backend) — Servidor local
10. **Módulo 9** (Desktop Tauri) — Empaquetado final

---

## 🔧 Stack Técnico Detectado

| Capa     | Tecnología                                                   |
| -------- | ------------------------------------------------------------ |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 3, shadcn/ui |
| Routing  | react-router-dom (HashRouter para SPA local)                 |
| Desktop  | Tauri v2                                                     |
| DB Local | SQLite (better-sqlite3)                                      |
| DB Cloud | Supabase (PostgreSQL)                                        |
| Terminal | xterm.js + node-pty                                          |
| Bot      | node-telegram-bot-api                                        |
| MCP      | Custom MCP Server (server.js)                                |
| Testing  | Playwright, Jest, tests unitarios Python                     |
| LLM      | Gemini (multi-cuenta), OpenRouter, OpenAI-compatible         |
