---
Fecha de Modificación: 27 de marzo de 2026
Changelog:
  - 2026-03-27 v1: Creación del documento base recopilando información funcional local/remota de DevHub, y sus requerimientos integrados para IDE+Agentes IA.
---

# 01 Requerimientos y Alcance

Este documento establece qué es DevHub, cuáles son sus propósitos centrales y los límites de su alcance funcional. Sirve como ancla para todas las discusiones arquitectónicas y de diseño a futuro, asegurando que todos los Agentes y Desarrolladores mantengan el enfoque en los verdaderos objetivos del producto.

## 🎯 ¿Qué es DevHub?

DevHub es un entorno de administración de proyectos robusto que evoluciona hacia un **IDE de Desarrollo Local** potenciado por Agentes IA. Ya no es una simple aplicación web estática; ahora actúa como un cliente de escritorio (Tauri) que integra funcionalidades reales del sistema operativo anfitrión (Kali Linux) mediante Servidores MCP (Model Context Protocol). 

La plataforma fusiona herramientas de gestión Kanban (tareas e hitos) con una suite técnica: explorador de archivos con previsualización (Monaco Editor) y terminal integrada de comandos bidireccional, permitiéndole al programador humano interactuar de forma colaborativa con Inteligencias Artificiales de desarrollo en la misma interfaz.

---

## 📈 Requerimientos Funcionales Core

Las funciones de DevHub están divididas en dos grandes dominios: **Gestión del Proyecto** y las **Herramientas de IDE**.

### A. Módulo de Gestión (Ya operacional 🟢)
1. **Administración de Proyectos (Project Hub):** Listado y configuración de proyectos conectados a bases remotas en la nube (Supabase). CRUD con métricas calculadas (completadas, pendientes).
2. **Tareas e Hitos (Kanban y Roadmap):** Organización visual de la carga de trabajo. Integrado con `tasks` y `milestones`.
3. **Registro Auditado (Historial):** Líneas de tiempo consolidadas y filtradas por mes y estado (Pendiente, Completado, etc.).
4. **Registro Estricto (Seguridad):** El sistema permite el inicio de sesión vía Supabase Auth, restringido estructuralmente en base de datos al administrador dueño.

### B. Módulo de IDE Local (Próxima Implementación 🚧)
1. **Terminal Integrada:**
   * **Requerimiento:** Una terminal TTY funcional y en tiempo real usando el motor `xterm.js` dentro del navegador. 
   * **Interacción:** El backend Node.js instanciará shells locales mediante `node-pty`. El flujo entre cliente e instancia OS fluirá vía WebSocket.
2. **Sistema de Archivos y Vista de Jerarquía:**
   * **Requerimiento:** Panel de exploración leyendo el disco duro en vivo iterando sobre la carpeta raíz del proyecto. 
   * **Reactividad:** Usar `fs/promises` y `chokidar` para actualizar el frontend React al instante sin recargas (`WebSocket` empujando los eventos). 
3. **Visor/Editor de Código Embebido:**
   * **Requerimiento:** Utilización de `@monaco-editor/react` (mismo engine de VS Code) como visualizador principal embebido, sin licencias, corriendo a nivel host. Si es posible, se permite la edición local del usuario y guardado asíncrono.
4. **Colaboración IA-Manejadas:**
   * Las Inteligencias Artificiales (como NEXUS-7 o Antigravity) actúan como agentes pares; tienen herramientas MCP para editar código, crear archivos, o correr shells de bash como `npm run build`.

---

## ⛔ Fuera de Alcance (Out of Scope)

Para evitar inflar el proyecto y preservar el rendimiento, se definen los siguientes límites técnicos u operativos:

* **Sincronización P2P en Nube para Archivos:** El código fuente del proyecto no se manda al Cloud y Supabase; los archivos se leen explícitamente y operan sobre el sistema operativo local `localhost` del administrador. (Supabase solo almacena meta-datos de Proyectos, Auth y Tareas).
* **Gestión de Múltiples Cuentas y Organizaciones SaaS:** Este es un software privativo y personal. Si bien el modelo de base de datos lo soporta teóricamente, el uso está intencionalmente diseñado para un único Owner como administrador central. No se incorporarán facturaciones automatizadas Stripe para clientes externos en la base.
* **Terminales Web Completamente "Isolated" / Containers por Proyecto:** Inicialmente, `node-pty` ejecutará comandos en la instancia host nativa que corre DevHub, con los privilegios del propio usuario, sin orquestar por defecto contenedores efímeros de Docker por cuestiones de velocidad y complejidad. El agente deberá cuidar no usar comandos destructivos `rm -rf /` en la máquina host.

---

## ✅ Control y Tracking Multiproceso (Agentes IA)

Toda implementación detallada a partir de los requerimientos mencionados deberá registrarse bajo el siguiente modelo para evitar colisiones:

> [!CAUTION]
> **Norma de Agentes Múltiples:** Dado el soporte MCP, varios Agentes operan concurrente sobre este repósitorio. Al tomar un Requerimiento para desarrollarlo, el Agente debe entrar al archivo *Roadmap* y al `06_QA_y_Verificacion.md` e insertar esta bandera `[🚧 TRABAJANDO por Antigravity / Agent Z]` antes de aplicar cualquier bloque de código en masa.

### Funcionalidades Core - Lista Maestra
📝 (Ejemplo de seguimiento para marcar en verde)

* [x] **1.1 Hub de Proyectos y CRUD** (Supabase Integrado)
* [x] **1.2 Auth Segura Owner Only** (Trigger SQL aplicado)
* [x] **1.3 Navegación React Router Native** (Corregidos los 404 de Next.js residual)
* [ ] **2.1 Terminal Integrada xterm** `[🚧 TRABAJANDO: Pendiente Plan Técnico]`
* [ ] **2.2 Servidor WebSocket de Backend (WS+Next.js)**
* [ ] **2.3 Scanner Node FS & Chokidar File Watcher**
* [ ] **2.4 Compilación de binarios Node PTY Linux**
