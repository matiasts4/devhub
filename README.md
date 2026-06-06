# DevHub

DevHub es tu hub centralizado para gestionar proyectos con integración profunda de Inteligencia Artificial (Enjambre de Agentes) y Protocolo de Contexto de Modelos (MCP).

## Características principales

- **Gestión de Proyectos, Tareas e Hitos**: Interfaz unificada construida sobre Next.js + Supabase.
- **Protocolo MCP Integrado**: DevHub funciona no solo como web app sino que provee un MCP (`devhub-mcp`) para agentes como Antigravity, Cline, etc.
- **Swarm Control**: Una cola de despacho que permite administrar un enjambre de sub-agentes asíncronos que pueden leer tu deuda técnica o ejecutar tests.
- **PWA Ready**: Instala DevHub directamente como app en el escritorio (Chrome / Edge / Safari).

## Quick Start

1. Instalar dependencias web: `npm install`
2. Correr entorno local: `npm run dev`
3. MCP Server:
   ```bash
   cd devhub-mcp
   npm ci
   npm start
   ```

## Arquitectura (Next.js 15 App Router + Supabase RLS)

DevHub está construido para escalar con **Server Components**, una API segmentada que funciona como puente para el MCP y **Row Level Security (RLS)** estricto por cada organización / usuario. Usa \`@upstash/ratelimit\` en middleware para frenar el abuso del rate de requests de agentes automatizados.

## Contribuir

Por favor asegúrate de revisar \`docs/\` (fases pasadas) para entender la evolución. Las PRs deben pasar Next build y tests (si se agregan test suites con coverage).

## Environment (cloud-foundation PR4+)

- `DEVHUB_DB_DRIVER=sqlite|supabase|postgres-generic` (default sqlite)
- `DATABASE_URL=postgres://...` (required for postgres-generic)
- `DATABASE_POOL_SIZE=10` (optional, default 10 for pg driver)
- `DATABASE_SSL=true` (optional for self-hosted pg)
