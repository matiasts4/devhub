# DevNexus AI — PRD

## Descripción del Proyecto
Dashboard web público para una aplicación llamada "DevNexus AI". Entorno de administración de tareas e IDE de alto nivel donde el usuario colabora con múltiples Agentes de IA para crear software y proyectos universitarios.

## Arquitectura Técnica
- **Frontend:** Next.js 15 (App Router) + TailwindCSS + lucide-react + Sonner
- **Backend:** FastAPI + MongoDB (no utilizado actualmente — datos mock)
- **Auth:** Mock auth en localStorage (email+password → 2FA → sesión)
- **Tema:** Dark Mode profundo (#0D1117) con colores neón de acento
- **Tipografía:** JetBrains Mono (headings/números) + Inter (body)

## Estructura de directorios
```
/app/frontend/src/
├── app/                         # Next.js App Router
│   ├── layout.js                # Root layout (Providers, Toaster)
│   ├── page.js                  # Redirect to /hub
│   ├── providers.js             # Client providers (AuthProvider, Toaster)
│   ├── login/page.js            # Login form con email+password
│   ├── auth/
│   │   ├── verify-2fa/page.js   # 2FA: TOTP (defecto) + Email OTP
│   │   └── setup-2fa/page.js    # Setup 2FA con QR Code
│   ├── hub/page.js              # ProjectHub (ruta protegida)
│   └── project/[projectId]/
│       ├── layout.js            # WorkspaceLayout con sidebar
│       ├── dashboard/page.js
│       ├── tareas/page.js
│       ├── agentes/page.js
│       ├── scaffolding/page.js
│       ├── roadmap/page.js
│       ├── conexiones/page.js
│       └── ajustes/page.js
├── context/
│   └── AuthContext.js           # Mock auth (localStorage: devnexus_session)
├── pages/                       # Componentes de página reutilizables
│   ├── ProjectHub.jsx           # Grid de proyectos + logout
│   ├── ProjectDashboard.jsx     # Dashboard del proyecto
│   ├── Tareas.jsx               # Kanban board
│   ├── CentroIA.jsx             # Agentes IA
│   ├── Conexiones.jsx           # Conexiones MCP
│   ├── Scaffolding.jsx
│   ├── Roadmap.jsx
│   └── Ajustes.jsx
├── components/                  # Componentes UI
│   ├── WorkspaceSidebar.jsx     # Sidebar con Next.js Link + usePathname
│   ├── BannerIA.jsx
│   ├── ChatAgente.jsx
│   ├── TareasActivas.jsx
│   ├── HistorialCommits.jsx
│   ├── MetricCard.jsx
│   └── UltimasInteracciones.jsx
└── data/projects.js             # Mock data (proyectos)
```

## Personas de Usuario
- Desarrolladores y estudiantes universitarios que usan agentes IA
- Acceso web público desde desktop y móvil

## Flujo de Autenticación (Mock)
1. `/login` → email + password (min 6 chars) → redirect a `/auth/verify-2fa`
2. `/auth/verify-2fa` → 6 dígitos TOTP/Email → redirect a `/hub`
3. `/hub` y `/project/*` → rutas protegidas (verifican `devnexus_session.mfaVerified === true`)
4. Logout → limpia localStorage → redirect a `/login`

## Implementado (Fase 3 — 2026-03 Migración Next.js + Auth)
- [x] Migración completa de CRA+React Router a Next.js 15 App Router
- [x] Sistema de autenticación frontend: Login + 2FA (TOTP por defecto, Email como alternativa)
- [x] Página Setup 2FA con QR Code y verificación
- [x] AuthContext con localStorage mock (devnexus_session)
- [x] Rutas protegidas con redirect a /login
- [x] Logout con email/escudo visible en ProjectHub
- [x] Todos los componentes con 'use client' para Next.js
- [x] WorkspaceSidebar migrado de NavLink a Next.js Link + usePathname

## Implementado (Fase 2 — 2026-02 Rediseño)
- [x] Sidebar colapsable con navegación
- [x] 7 páginas completas y funcionales
- [x] Dashboard con 6 widgets
- [x] Sistema de notificaciones con Sonner
- [x] Paleta de colores neón: #39FF14, #00F0FF, #FF007F, #FFE600

## Datos Mock
Todos los datos son estáticos (mock). No se realizan llamadas reales a backend.

## Backlog Priorizado
### P0 (Crítico)
- [ ] Implementar MCP Server en FastAPI backend con SSE transport
- [ ] Conectar con backend real (FastAPI) para datos de proyectos y tareas

### P1 (Alta Prioridad)
- [ ] Integración real con LLM para Chat NEXUS-7 (GPT-4o/Claude)
- [ ] Sistema de tareas CRUD persistente en MongoDB
- [ ] Modal "Crear Proyecto" con asistente IA

### P2 (Mejoras)
- [ ] Autenticación real con JWT y base de datos
- [ ] 2FA real: TOTP con librería (speakeasy) + Email via SMTP
- [ ] Terminal integrada en el dashboard
- [ ] Historial de commits real via GitHub API
- [ ] Notificaciones push vía WebSocket
- [ ] Diseño responsive mejorado para móvil
