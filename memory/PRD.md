# DevNexus AI Dashboard — PRD

## Descripción del Proyecto
Dashboard principal para una aplicación de escritorio llamada "DevNexus AI". Entorno de administración de tareas e IDE de alto nivel donde el usuario colabora con múltiples Agentes de IA para crear software desde cero.

## Arquitectura Técnica
- **Frontend:** React + React Router DOM v7 + TailwindCSS + lucide-react
- **Backend:** FastAPI + MongoDB (no utilizado en esta fase — datos mock)
- **Tema:** Dark Mode profundo (#0B0F19) con colores neón de acento
- **Tipografía:** JetBrains Mono (headings/números) + Inter (body)

## Personas de Usuario
- Desarrolladores de software que usan agentes IA para construir aplicaciones
- Desktop-first (optimizado para pantallas de escritorio)

## Páginas Implementadas (7 rutas)
| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/dashboard` | Dashboard.jsx | Vista principal con métricas, tareas, chat, commits |
| `/proyectos` | Proyectos.jsx | Grid de proyectos con progreso y stack |
| `/scaffolding` | Scaffolding.jsx | Templates + sugerencias IA de paquetes |
| `/roadmap` | Roadmap.jsx | Timeline de fases y hitos |
| `/centro-ia` | CentroIA.jsx | Panel de agentes IA (Pausar/Activar) |
| `/conexiones` | Conexiones.jsx | Conexiones MCP + estado |
| `/ajustes` | Ajustes.jsx | Configuración general, agentes, seguridad, notificaciones |

## Componentes del Dashboard Principal
- **BannerIA** — Sugerencias rotativas de arquitectura con Aceptar/Rechazar
- **MetricCard** (×4) — Seguridad & Auth (verde), UI/UX (azul), Backend (rosa), Deuda Técnica (amarillo)
- **TareasActivas** — Lista de tareas de agentes IA con estado y progreso
- **ChatAgente** — Chat con NEXUS-7 con respuestas mock y typing indicator
- **HistorialCommits** — Historial git con hash, rama, autor
- **UltimasInteracciones** — Tabla de últimas acciones usuario-IA

## Datos Mock
Todos los datos son estáticos (mock). No se realizan llamadas reales a backend.

## Implementado (Fase 1 — 2026-02)
- [x] Sidebar colapsable con navegación React Router
- [x] 7 páginas completas y funcionales
- [x] Dashboard con 6 widgets
- [x] Sistema de notificaciones con Sonner (toasts)
- [x] Animaciones fade-in-up con stagger delay
- [x] Paleta de colores neón: #39FF14, #00F0FF, #FF007F, #FFE600
- [x] Font: JetBrains Mono + Inter

## Backlog Priorizado
### P0 (Crítico)
- [ ] Conectar con backend real (FastAPI) para datos de proyectos y tareas
- [ ] Autenticación real (JWT)

### P1 (Alta Prioridad)
- [ ] Integración real con LLM para Chat NEXUS-7 (GPT-4o/Claude)
- [ ] Sistema de tareas CRUD persistente en MongoDB
- [ ] Historial de commits real via GitHub API

### P2 (Mejoras)
- [ ] Terminal integrada en el dashboard
- [ ] Edición de código inline (Monaco Editor)
- [ ] Notificaciones push vía WebSocket
- [ ] Modo multi-proyecto (tabs)
- [ ] Export de reportes PDF
