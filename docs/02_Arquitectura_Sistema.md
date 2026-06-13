---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-03-28 v3: [QA-02] Documentada decisión: eliminación de `output: 'export'`. DevHub adopta Next.js Server Mode. Sección 4 añadida.
  - 2026-03-27 v2: Integración de los planes de Arquitectura IDE (Gestor + Terminal).
  - 2026-03-27 v1: Creación del documento unificado.
---

# 02 Arquitectura del Sistema

Este documento recopila la estructura técnica, de base de datos, backend, frontend y las capas que interactúan con el Sistema Operativo (IDE Local).

---

## 🏗️ 1. Arquitectura Base (Cliente Pesado + DB Nube)

DevHub es fundamentalmente un **Instalador de Escritorio** construido con **Tauri** que sirve una aplicación Next.js localmente pero se conecta a una base de datos **Supabase compartida en la Nube**.

- **Frontend/App UI:** Next.js 15 (App Router exportado estáticamente) + React 19.
- **Enrutamiento Cliente:** `react-router-dom` (HashRouter para SPA compatible con archivos puramente locales).
- **Core de Escritorio:** Tauri v2 (binario ligero que renderiza el WebView sin necesitar Node.js embebido completo como Electron).
- **Base de Datos y Auth:** Supabase (PostgreSQL) alojado externamente.
- **Estilos:** Tailwind CSS 3 + shadcn/ui.

---

## 🖥️ 2. Arquitectura IDE (Módulos Locales)

Al ser DevHub no sólo un panel Trello/Kanban sino un IDE colaborativo con la IA, integra herramientas profundas corriendo sobre el servidor local:

### 2.1 Módulo Terminal Integrada

- **Frontend (WebView Viewer):** Renderizado con `xterm.js`, `xterm-addon-fit` y `xterm-addon-webgl` para soportar secuencias ANSI complejas e imitar exactitud a VS Code. La capa de render es seleccionable por panel: `xterm + WebGL` (default para terminales en workspace) o `GTK VTE` (default histórico, requerido para superficies pizarra).
- **Backend (El Proceso real PTY):** `node-pty` instancia una shell nativa (`/bin/bash` o `/bin/zsh`).
- **Puente:** Un servidor WebSocket bidireccional de bajísima latencia transfiere lo tecleado en `xterm` hacia el input de bash, y retorna los `stdout/stderr`.
- **Consideración de OS Host (Kali Linux):** `node-pty` necesita compilación nativa en caliente o pre-compilada, requiriendo paquetes del sistema operativo base: `build-essential`, `g++`, `make`, y `python3`.
- **Selección de renderer por panel:** el header de cada panel expone un switcher (`PanelRendererSelect`) que persiste la elección en `terminalRendererPreferences` por `(workspaceId, panelId)`. Si WebGL no está disponible en runtime, fallback silencioso a `xterm DOM` con un warning en el cuerpo del panel. Ver `openspec/changes/terminal-renderer-xterm-webgl/` para el contrato.

### 2.2 Módulo Gestor de Archivos (File Manager)

- **Backend Scanner:** API Local mapeada utilizando `fs/promises` y recursión para devolver estructuras de directorios tipo árbol sin sobrecargar la red. Ignorará preventivamente carpetas masivas como `node_modules` y `.git`.
- **Sincronización Tiempo Real:** `chokidar` en Node vigila los archivos. Al detectar un update (ej. creado por IA), se emite un WebSocket a Next.js para repintar la vista sin F5.
- **Visor Embebido:** `@monaco-editor/react` actuará como editor interno, proporcionando un motor inmenso de lectura y coloreado sintáctico, todo gratuito y alojado of-line en el paquete.

---

## 🔧 3. Sinergia Autónoma (Integración de Agentes MCP)

La base MCP instalada en el usuario corre paralela a la arquitectura descrita:

- **Edición de Código:** El agente puede instruir un `fs.writeFile()`. Inmediatamente la Arquitectura de _IDE Local_ entra en acción: `chokidar` notifica por WebSocket y el frontend resalta en el "Tree File" que se acaba de crear un archivo en milisegundos.
- **Comandos en Crudo:** Los scripts y CLI tools que invoca el agente interactúan en el fondo llamando `child_process.exec()`, pero gracias a `node-pty`, **pueden ser redirigidos visualmente a la Terminal Integrada** para que el usuario humano de DevHub vea la IA trabajar frente a sus ojos como si otra persona estuviera tipeando en su consola.

---

## 📋 Fragmento Base - Scanner Local Recursivo

Para referencia en la futura implementación del servidor local (Fase 5), este es el endpoint TS pre-aprobado para explorar las carpetas:

```typescript
import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

const IGNORED_PATHS = ['node_modules', '.git', 'dist', '.vscode', '.next', 'src-tauri/target'];

async function buildFileTree(dirPath: string, rootDir: string): Promise<FileNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (IGNORED_PATHS.includes(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'directory',
        children: await buildFileTree(fullPath, rootDir),
      });
    } else {
      nodes.push({ name: entry.name, path: relativePath, type: 'file' });
    }
  }

  return nodes.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectRoot = searchParams.get('rootPath') || process.cwd();

    const stats = await fs.stat(projectRoot);
    if (!stats.isDirectory()) {
      return NextResponse.json(
        { error: 'Ruta especificada no es un directorio.' },
        { status: 400 }
      );
    }

    const tree = await buildFileTree(projectRoot, projectRoot);
    return NextResponse.json({ data: tree }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

## ⚙️ 4. Decisión de Compilación — [QA-02] Eliminación de `output: 'export'`

> **Estado:** ✅ Resuelto en Fase 6 (2026-03-28)

### Contexto del Problema

La directiva `output: 'export'` en `next.config.js` compilaba DevHub como un sitio estático puro. Esto causaba crasheo inmediato (`Error 500`) en todas las API Routes que requieren un servidor Node activo: `/api/terminal/session`, `/api/agent/execute`, `/api/agent/branches`.

### Decisión Tomada: **Opción B — Next.js Server Mode**

Se eliminó `output: 'export'` del `next.config.js`. DevHub funciona ahora en **modo servidor completo de Next.js**, lo que permite API Routes dinámicas, WebSockets nativos y Middleware Edge Functions.

```javascript
// next.config.js — Estado actual
const nextConfig = {
  // output: 'export'  ← ELIMINADA (era el conflicto raíz)
  images: { unoptimized: true },
  trailingSlash: true,
  experimental: {
    serverComponentsExternalPackages: ['node-pty', 'ws'],
  },
};
```

### Impacto en Distribución

- **Deploy Web:** Compatible con Vercel, Railway, VPS con `next start`.
- **Desktop (Tauri):** Requiere proceso `next start` como sidecar.
- **PWA:** Configurada con `next-pwa` para instalación desde navegador.
