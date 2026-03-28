---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-03-28 v1: Creación del documento. Cubre las 7 tareas del Milestone "Fase 9 — Producción, Seguridad y Distribución".
Milestone: "Fase 9 — Producción, Seguridad y Distribución"
Due Date: 2026-06-25
---

# 17 Producción, Seguridad y Distribución

Esta es la fase final antes del lanzamiento público. Cubre todos los aspectos que hacen la diferencia entre un prototipo y un producto real: seguridad sin compromiso, estrategia de distribución definida, monitoreo en producción, y documentación que habla por sí sola.

> **Prerrequisito:** Esta fase debe comenzarse **después** de que todas las fases anteriores estén funcionales y las suites de testing pasen en CI.

---

## Tareas de esta fase

---

### [PROD-01] Auditoría de Seguridad Completa (RLS, Rate Limit, Inputs)

**Prioridad:** `critical`
**Due:** 2026-06-14
**Responsable:** Security-Worker / QA-Worker

**Descripción completa:**
Una auditoría sistemática de todas las superficies de ataque del sistema antes de exponerlo a usuarios reales.

**Checklist completo:**

**1. Supabase RLS:**
```bash
# Correr en el MCP de Supabase para detectar tablas sin RLS
# Usar: mcp_supabase-mcp-server_get_advisors({ project_id, type: 'security' })
```
- Verificar que TODAS las tablas creadas tienen RLS habilitado.
- Verificar que no existe ninguna policy `FOR ALL USING (true)` o similar que permita acceso total.
- Verificar que las policies de INSERT tienen `WITH CHECK` además del `USING`.

**2. API Keys y secretos:**
- Auditar que `SUPABASE_SERVICE_ROLE_KEY` **nunca** está disponible en el frontend.
- Verificar que `.env.local` está en `.gitignore` y nunca fue committeado.
- Usar `git log --all -- '*.env*'` para detectar si alguna vez se committeó un archivo `.env`.
- Auditar que las API Keys de LLM se almacenan cifradas, nunca en texto plano.

**3. Rate Limiting en API Routes:**
```javascript
// Implementar con upstash-ratelimit (recomendado)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),  // 10 requests por 10 segundos
});

// En cada API Route:
export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for') ?? 'anonymous';
  const { success } = await ratelimit.limit(ip);
  if (!success) return new Response('Too Many Requests', { status: 429 });
  // ... resto del handler
}
```

Aplicar rate limiting especialmente en:
- `/api/agent/execute` (máx 1 request concurrente por usuario)
- `/api/agent/spawn` (máx 5 por minuto)
- `/api/projects/[id]/invite` (máx 10 por hora para evitar spam)

**4. Validación de inputs con Zod:**
```javascript
// Todos los endpoints deben validar el body con Zod antes de procesarlo
import { z } from 'zod';

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  project_id: z.string().uuid(),
});

// En el handler:
const parsed = CreateTaskSchema.safeParse(await req.json());
if (!parsed.success) return new Response(JSON.stringify(parsed.error), { status: 400 });
```

**5. Headers de seguridad en `next.config.js`:**
```javascript
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];
```

---

### [PROD-02] Definir y Configurar Estrategia de Distribución (Tauri vs Web)

**Prioridad:** `high`
**Due:** 2026-06-15
**Responsable:** Arquitecto / DevOps-Worker

**Descripción completa:**
El proyecto tiene un directorio `src-tauri/` lo que indica intención de distribución como app de escritorio nativa. Pero también requiere un servidor Node para el terminal PTY y las API Routes. Esta decisión debe resolverse definitivamente.

**Análisis de opciones:**

| Criterio | Opción A: Tauri Desktop | Opción B: Web App Pura |
|----------|------------------------|------------------------|
| Terminal PTY | ✅ Nativo con Tauri shell | Solo si hay servidor Node |
| API Routes dinámicas | ⚠️ Necesita sidecar | ✅ Funciona nativamente |
| Distribución | Instalador (.deb, .dmg, .exe) | URL compartida |
| Updates | Manual o Tauri updater | Automáticas con Vercel |
| Multi-usuario/colaboración | ⚠️ Cada user necesita instalar | ✅ Funciona directo |
| Complejidad de build | Alta | Baja |

**Recomendación:** Si el objetivo es multi-usuario y colaboración (Fase 8), **Opción B es más coherente**. La terminal PTY puede vivir como un proceso separado (`devhub-mcp/`) que corre localmente y se expone vía WebSocket, al que el frontend web conecta opcionalmente.

**Si se elige Opción B (Web):**
```javascript
// next.config.js — estado final
const nextConfig = {
  // output: 'export' ELIMINADO
  reactStrictMode: true,
  experimental: { serverActions: true }
};
```

**Deploy en Vercel:**
```bash
# Variables de entorno requeridas en Vercel:
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

**Si se elige Opción A (Tauri):**
- Mover toda la lógica de API Routes al `devhub-mcp/server.js` como servidor local.
- El frontend Tauri conecta al MCP server como sidecar.
- Build: `npm run tauri build`.

**Documentar la decisión final** en `docs/02_Arquitectura_Sistema.md`.

---

### [PROD-03] Publicar MCP Server como paquete npm instalable

**Prioridad:** `medium`
**Due:** 2026-06-17
**Responsable:** CLI-Worker / DevOps-Worker

**Descripción completa:**
Hacer que cualquier desarrollador pueda instalar el MCP de DevHub en su setup de IA en menos de 2 minutos.

**Preparación del paquete:**

```json
// devhub-mcp/package.json
{
  "name": "@devhub/mcp-server",
  "version": "1.0.0",
  "description": "DevHub MCP Server — Connect your AI agent to DevHub project management",
  "main": "server.js",
  "bin": {
    "devhub-mcp": "./cli.js"
  },
  "keywords": ["mcp", "ai-agent", "project-management", "devhub"],
  "license": "MIT"
}
```

**CLI de setup (`devhub-mcp/cli.js`):**
```javascript
#!/usr/bin/env node
// npx @devhub/mcp-setup
const os = require('os');
const path = require('path');
const fs = require('fs');

const configPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Añadir devhub al mcp_config.json
config.mcpServers.devhub = {
  command: "node",
  args: [require.resolve("@devhub/mcp-server/server.js")],
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  }
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('✅ DevHub MCP configurado correctamente en', configPath);
```

**Publicar:**
```bash
cd devhub-mcp
npm publish --access public
```

**Instrucción de instalación (para el README):**
```bash
npx @devhub/mcp-setup
# o manualmente:
npm install -g @devhub/mcp-server
```

---

### [PROD-04] Documentación de Usuario Final y Guía Quick Start

**Prioridad:** `medium`
**Due:** 2026-06-20
**Responsable:** Documentador-Worker / UI-Worker

**Descripción completa:**
Crear la documentación orientada al usuario final (no al desarrollador del proyecto, sino al usuario que lo usa para gestionar sus propios proyectos).

**Directorio:** `docs/user/` (separado del `docs/` técnico que usan los agentes).

**Archivos a crear:**

**`docs/user/01_Quick_Start.md`:**
```markdown
# DevHub — Guía de Inicio Rápido (5 minutos)

## Paso 1 — Instalar el MCP
npx @devhub/mcp-setup

## Paso 2 — Crear tu primer proyecto
1. Abre DevHub en tu navegador
2. Haz clic en "Nuevo Proyecto"
3. Activa "Planning IA" y describe tu proyecto
4. Adjunta archivos de contexto si tienes (README, specs, wireframes)
5. Haz clic en "Crear"

## Paso 3 — Generar el plan con IA
1. Copia el prompt generado en /project/:id/planning
2. Pégalo en tu chat con Antigravity (o el agente MCP de tu elección)
3. Espera a que el agente cree milestones y tareas (2-5 minutos)

## Paso 4 — Ejecutar tareas con el Swarm
1. Ve a "Cola de Agente"
2. Haz clic en ⚡ en la tarea de mayor prioridad
3. Pega el prompt generado en tu Worker Agent
4. Supervisa el progreso en SwarmControl
```

**`docs/user/02_SwarmControl_Explained.md`** — Cómo interpretar el panel de control del Swarm.

**`docs/user/03_Priorization_System.md`** — Cómo funciona el scoring de prioridades y cómo configurar dependencias.

**`docs/user/04_FAQ.md`** — Preguntas frecuentes y problemas comunes.

---

### [PROD-05] Monitoreo y Observabilidad en Producción (Sentry + Métricas)

**Prioridad:** `medium`
**Due:** 2026-06-22
**Responsable:** DevOps-Worker

**Descripción completa:**
Sin monitoreo, los bugs en producción solo se descubren cuando el usuario se queja. Esta tarea implementa observabilidad desde el día uno del lanzamiento.

**1. Sentry para errores del frontend:**
```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

```javascript
// sentry.client.config.js
import * as Sentry from "@sentry/nextjs";
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,       // 100% en staging, reducir a 0.1 en producción
  replaysSessionSampleRate: 0.1,
});
```

**2. Métricas de uso (eventos personalizados):**
```javascript
// Eventos de negocio a rastrear:
Sentry.metrics.increment("tasks.created");
Sentry.metrics.increment("agents.spawned", 1, { tags: { provider: "anthropic" } });
Sentry.metrics.distribution("task.completion_time", hours, { unit: "hour" });
Sentry.metrics.gauge("projects.active", activeProjects);
```

**3. Alertas de latencia Supabase:**
```javascript
// Middleware para detectar queries lentas
const start = Date.now();
const result = await supabase.from('tasks').select('*');
const duration = Date.now() - start;
if (duration > 2000) {
  Sentry.captureMessage(`Query lenta: tasks SELECT tomó ${duration}ms`, 'warning');
}
```

**4. Dashboard de Uptime:**
- Configurar un monitor de uptime en Sentry o Better Uptime para `[URL]/api/health`.
- Crear endpoint `GET /api/health` que verifique: conexión a Supabase, MCP server activo, y devuelva 200 con `{ status: 'ok', db: 'connected', version: '1.0.0' }`.

---

### [PROD-06] README.md definitivo con arquitectura, capturas y guía de contribución

**Prioridad:** `low`
**Due:** 2026-06-24
**Responsable:** Documentador-Worker

**Descripción completa:**
El README.md actual del repositorio es básico. Debe reescribirse como la carta de presentación del proyecto para la comunidad de desarrolladores.

**Estructura del README final:**

```markdown
# DevHub — AI-Powered Developer Workspace

[Banner image] [CI Badge] [npm badge] [License badge]

> El espacio de trabajo donde la IA toma las tareas, crea las ramas, escribe el código y pasa el QA. Tú supervisas.

## ✨ Features
- 🧠 Planning IA — genera 40-60+ tareas organizadas en milestones automáticamente
- ⚡ Swarm Control — Workers de IA ejecutan tareas en paralelo con ramas Git aisladas
- 🔢 Priorización inteligente — scoring multidimensional que sabe qué ejecutar primero
- 📊 Analítica real — velocity tracking, predicción de entrega, memory graph
- 👥 Multi-usuario — roles, invitaciones, colaboración en tiempo real

## 🏗️ Arquitectura
[Diagrama Mermaid de la arquitectura]

## 🚀 Instalación rápida
npx @devhub/mcp-setup

## 📚 Documentación
- [Quick Start](docs/user/01_Quick_Start.md)
- [Swarm Control](docs/user/02_SwarmControl_Explained.md)
- [API Reference](docs/04_Protocolo_MCP_y_Agentes.md)

## 🛠️ Desarrollo local
[Instrucciones]

## 🤝 Contribuir
[Guía de contribución]
```

---

### [PROD-07] Progressive Web App (PWA) — Instalable desde navegador

**Prioridad:** `low`
**Due:** 2026-06-23
**Responsable:** Frontend-Worker

**Descripción completa:**
Si se elige la distribución como Web App (ver `[PROD-02]`), la PWA permite que los usuarios instalen DevHub directamente desde Chrome/Edge como si fuera una app de escritorio, sin necesidad de Tauri.

**Instalación:**
```bash
npm install next-pwa
```

**Configuración en `next.config.js`:**
```javascript
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

module.exports = withPWA(nextConfig);
```

**`public/manifest.json`:**
```json
{
  "name": "DevHub",
  "short_name": "DevHub",
  "description": "AI-Powered Developer Workspace",
  "start_url": "/hub",
  "display": "standalone",
  "background_color": "#0d1117",
  "theme_color": "#58A6FF",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Generar iconos:** Usar una herramienta como `pwa-asset-generator` con el logo de DevHub.

**Estrategia de cache:**
```javascript
// Cache para assets estáticos (JS, CSS, imágenes)
// Network-first para datos dinámicos (API de Supabase)
// Offline fallback page: /offline.html
```

**Página offline (`public/offline.html`):**
Página simple que avisa al usuario que está desconectado, con botón de "Reintentar" y enlace a la última versión cacheada del proyecto que estaba viendo.
