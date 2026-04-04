# Módulo 1: Frontend Next.js — REPORTE DE REVISIÓN

> **Fecha:** Abril 2026
> **Estado:** ✅ Revisado

---

## ✅ Estructura Principal

### `src/app/layout.js` (31 líneas)

**Estado:** ✅ Bien estructurado

- Server Component (sin `'use client'`) — correcto
- Metadata bien configurada
- `suppressHydrationWarning` en `<html>` — apropiado para temas
- Fonts cargadas via `<link>` en `<head>` — no optimizado (debería usar `next/font`)

### `src/app/page.js` (10 líneas)

**Estado:** ✅ Correcto

- `'use client'` + `dynamic()` con `ssr: false` — patrón correcto para envolver React Router en Next.js
- Devuelve `<App />` que usa `HashRouter`

### `src/app/providers.js` (4 líneas)

**Estado:** ⚠️ Stub vacío

- Comentario dice "Local-first: no auth providers needed"
- Solo devuelve `children` — no aporta nada actualmente
- Debería eliminarse o documentarse como placeholder

---

## ⚠️ Settings Pages

### `src/app/settings/page.jsx` (5 líneas)

**Estado:** ✅ Simple redirect a `/settings/appearance`

### `src/app/settings/layout.jsx` (195 líneas)

**Estado:** ⚠️ Issues encontrados

**Problemas:**

1. **10 items de navegación definidos pero solo 2 páginas existen:**
   - ✅ `/settings/appearance` — existe
   - ✅ `/settings/llm-providers` — existe
   - ❌ `/settings/account` — NO existe (404)
   - ❌ `/settings/shortcuts` — NO existe (404)
   - ❌ `/settings/agents` — NO existe (404)
   - ❌ `/settings/voice` — NO existe (404)
   - ❌ `/settings/notifications` — NO existe (404)
   - ❌ `/settings/cli` — NO existe (404)
   - ❌ `/settings/keys` — NO existe (404)

2. **Botones decorativos sin funcionalidad:**
   - "No workspaces open" — hardcodeado, no refleja estado real
   - Botón "+" de crear workspace — sin handler
   - Botón "BRIDGEVOICE #" — sin funcionalidad
   - Botón de quick actions (Zap) — sin funcionalidad

3. **Duplicación con `src/views/Ajustes.jsx`:**
   - Existe `/settings` (App Router) Y `src/views/Ajustes.jsx` (React Router)
   - Son dos sistemas de settings diferentes — confuso

---

## 🎨 CSS y Estilos

### `src/app/globals.css` (485 líneas)

**Estado:** ✅ Bien organizado

**Estructura:**

- Import de fonts (duplicado con layout.js — ver issue)
- Import de xterm.css
- Import de opencode-vars.css
- Tailwind CSS v4 con config
- 8 temas definidos: deep-sea, nord, dracula, light, catppuccin, tokyo-night, monokai, synthwave
- Animaciones: fadeInUp, slideInRight, typing-dot
- Estilos custom: project-card-hover, dot-grid
- Overrides de xterm.js

**Issues:**

1. **Fonts duplicados:** Se cargan en `globals.css` via `@import` Y en `layout.js` via `<link>`. Debería usarse solo uno (preferiblemente `next/font` para optimización).

### `src/app/opencode-vars.css` (1381 líneas)

**Estado:** ⚠️ Excesivo + bugs

**Problemas:**

1. **1381 líneas de design tokens** — es un archivo enorme copiado de OpenCode. La mayoría de estos tokens no se usan en DevHub.
2. **Typos en nombres de variables (24 líneas muertas):**
   - `--amber-lightalpha-1` debería ser `--amber-light-alpha-1` (falta el guion)
   - `--amber-darkalpha-1` debería ser `--amber-dark-alpha-1`
   - Estas 24 líneas son alias que apuntan a las variables correctas pero con nombre typo — nadie las usa
3. **Variables duplicadas:** `--smoke-dark-*` y `--smoke-light-*` se definen dos veces — primero como valores hardcodeados, luego como aliases de `--gray-*`
4. **`color-scheme: light` en `:root`** pero luego se sobrescribe con `@media (prefers-color-scheme: dark)` — funciona pero es confuso

---

## 🔍 Server vs Client Components

### Componentes Server (correcto)

| Archivo                 | Tipo   | Estado |
| ----------------------- | ------ | ------ |
| `app/layout.js`         | Server | ✅     |
| `app/settings/page.jsx` | Server | ✅     |

### Componentes Client

| Archivo                   | Tipo   | Estado                                       |
| ------------------------- | ------ | -------------------------------------------- |
| `app/page.js`             | Client | ✅ Necesario (envuelve App con React Router) |
| `app/settings/layout.jsx` | Client | ⚠️ Podría ser server con client islands      |
| `app/providers.js`        | Server | ✅ (no tiene `'use client'`)                 |

### Patrón de arquitectura

La app usa un **patrón híbrido problemático**:

1. Next.js App Router serve como shell (`layout.js` → `page.js`)
2. `page.js` carga `App.js` con SSR deshabilitado
3. `App.js` usa `HashRouter` de React Router
4. Todas las vistas viven en `src/views/` y se manejan con React Router

**Esto significa:** Next.js App Router se usa solo como wrapper. Todo el routing real lo hace React Router. Esto anula las ventajas de Next.js (SSR, Server Components, SEO).

---

## 💀 Código Muerto

### Archivos muertos

| Archivo                                    | Líneas | Razón                                        |
| ------------------------------------------ | ------ | -------------------------------------------- |
| `app/providers.js`                         | 4      | Stub vacío, solo devuelve children           |
| `app/opencode-vars.css` (líneas 1351-1375) | 24     | Typos en nombres de variables, nadie las usa |
| `app/opencode-vars.css` (líneas 1298-1323) | 26     | smoke-\* duplicado (definido 2 veces)        |

### Rutas de settings inexistentes (8 links rotos)

| Ruta                      | Estado |
| ------------------------- | ------ |
| `/settings/account`       | 404    |
| `/settings/shortcuts`     | 404    |
| `/settings/agents`        | 404    |
| `/settings/voice`         | 404    |
| `/settings/notifications` | 404    |
| `/settings/cli`           | 404    |
| `/settings/keys`          | 404    |

---

## 📊 Resumen

| Categoría         | Estado  | Issues                                    |
| ----------------- | ------- | ----------------------------------------- |
| Layout            | ✅ Bien | Fonts duplicados                          |
| Page              | ✅ Bien | Ninguno                                   |
| Providers         | ⚠️ Stub | 4 líneas muertas                          |
| Settings Layout   | ⚠️      | 8 links rotos, botones decorativos        |
| Settings Pages    | ⚠️      | Solo 2 de 10 páginas existen              |
| globals.css       | ✅ Bien | Fonts duplicadas con layout.js            |
| opencode-vars.css | ⚠️      | 1381 líneas, 24 typos, 26 duplicados      |
| Arquitectura      | ⚠️      | Next.js como wrapper, React Router domina |

---

## 🔧 Fixes recomendados

### Prioridad 1 — Links rotos

1. **Eliminar 8 items de navegación** en `settings/layout.jsx` que apuntan a páginas inexistentes
2. **O crear las 8 páginas faltantes** si se planean implementar

### Prioridad 2 — CSS

3. **Eliminar fonts duplicados** — elegir `next/font` (óptimo) o `<link>` (simple), no ambos
4. **Corregir typos en opencode-vars.css** — `amber-lightalpha` → `amber-light-alpha` (24 líneas)
5. **Eliminar smoke-\* duplicado** — 26 líneas de alias innecesarios
6. **Considerar reducir opencode-vars.css** — 1381 líneas de tokens, la mayoría no usados

### Prioridad 3 — Arquitectura

7. **Eliminar `providers.js`** o documentar como placeholder
8. **Resolver duplicación de settings** — `/settings` (App Router) vs `/ajustes` (React Router)
9. **Botones decorativos** en settings layout — agregar funcionalidad o eliminar
