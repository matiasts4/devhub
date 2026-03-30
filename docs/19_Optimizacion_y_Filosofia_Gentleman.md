---
Fecha de Modificación: 29 de marzo de 2026
Changelog:
  - 2026-03-29 v1: Fundación de la estrategia de optimización de tokens y adopción de la filosofía The Gentleman (Gentle AI) usando OpenCode y Gemini CLI.
---

# 19 Optimización de Contexto y Filosofía The Gentleman

## 🎯 Objetivo Central
Integrar la filosofía y herramientas de **The Gentleman** (Gentle AI, Engram, SDD) en DevHub **sin inflar el consumo de tokens ni generar ruido innecesario**. DevHub no debe ser un cuello de botella ni un devorador de contexto; debe actuar como un orquestador ultra-eficiente y una capa de visualización elegante para el trabajo pesado que realizan las herramientas subyacentes.

## 🧠 Filosofía de Optimización (Cero Ruido)

El mayor riesgo de los sistemas multi-agente es el "token bloat" (inflación del contexto). Para evitar que DevHub consuma tokens a lo loco, aplicaremos reglas estrictas basadas en la arquitectura Antigravity:

1. **Contexto Quirúrgico (No inyectar todo):** 
   - Los agentes **NO** deben leer todo el proyecto para entenderlo. 
   - Se utilizará la memoria semántica (Engram) para recuperar *solo* los fragmentos de conocimiento, decisiones arquitectónicas o bugs relevantes para la tarea actual.
2. **Separación de Fases (SDD en Aislamiento):**
   - El Spec-Driven Development (SDD) divide el problema. En lugar de un mega-prompt que diga "hacé esta feature", se divide en `sdd-propose` -> `sdd-spec` -> `sdd-tasks` -> `sdd-apply`.
   - Cada fase se ejecuta de forma independiente. El agente en la fase `sdd-apply` solo necesita leer la especificación generada en la fase anterior, no toda la discusión previa.
3. **Delegación de Trabajo Pesado:**
   - DevHub no debe procesar lógicas de archivos masivas en su propio bucle. Actuará como el "Mission Control".

## 🛠️ Herramientas Fundacionales

A partir de esta fase, el desarrollo y la orquestación se apoyarán fuertemente en herramientas externas optimizadas:

* **OpenCode:** Se utilizará como motor de ejecución y manipulación precisa del sistema de archivos, garantizando que las escrituras y lecturas sean atómicas y eficientes.
* **Gemini CLI (Antigravity/Gentleman):** Actuará como el cerebro residente en la terminal del desarrollador. Utilizará sus *skills* integradas (`sdd-init`, `sdd-apply`, `judgment-day`) para ejecutar el trabajo complejo.

## 🖥️ El Rol de DevHub (Capa de Visualización y Control)

Para no entorpecer el rendimiento de la CLI y OpenCode, **DevHub se reposiciona como el "IDE de Orquestación"**:

1. **Tablero de Control Visual:** DevHub lee los *Engrams* (memorias persistentes guardadas en Supabase) y las tareas del Kanban, renderizándolas en la UI (`ProjectDashboard`, `Roadmap`, `DiffViewer`).
2. **Lanzador de Procesos:** En lugar de mantener a un agente de DevHub "pensando" constantemente, DevHub simplemente dispara comandos a la Gemini CLI o levanta sub-procesos optimizados cuando el usuario aprueba una fase (ej. aprobar un SDD Proposal).
3. **Transparencia del Swarm:** DevHub muestra *qué* están haciendo los agentes (ej. "Worker-1 está en la fase sdd-apply en la rama task/123"), leyendo los estados de la base de datos o de los archivos de estado temporal, sin tener que tragarse el contexto de la conversación del agente.

## 📝 Regla de Oro para Documentación Futura
Toda documentación nueva o decisión técnica DEBE guardarse usando el protocolo **Engram** (`mem_save`). Los archivos `.md` tradicionales en la carpeta `docs/` se mantendrán para la arquitectura de alto nivel (como este archivo), pero los micro-aprendizajes y el contexto del día a día residirán en el grafo de conocimiento para ser consultados quirúrgicamente.
