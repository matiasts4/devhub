# Configuración y Estrategia Desktop (Tauri)

## Conflicto Next.js SSR vs Tauri
Dado que DevHub utiliza rutas dinámicas (API routes) y WebSockets para la integración con `node-pty`, no es posible compilar el frontend usando `output: 'export'` (Static Site Generation puro). 

## Solución Adoptada
1. **Desarrollo:** Tauri apunta a `http://localhost:3000` donde Next.js corre su servidor de desarrollo.
2. **Producción:** Next.js se compilará con `output: 'standalone'`. Este servidor Node.js independiente se empaquetará como un *sidecar* para Tauri (usando herramientas como `pkg` o binarios dedicados). Tauri lanzará este sidecar en segundo plano al iniciar y cargará la URL local correspondientemente.
