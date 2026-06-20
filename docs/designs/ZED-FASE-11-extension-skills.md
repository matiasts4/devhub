# Zed: Fase 11 — Extensión de skills

**Estado**: draft  
**Última actualización**: 2026-06-20  
**Propietario**: DevHub team  
**Proyecto MCP**: `fd1d5538-6d55-499e-8928-8ee93aa64cc7` — _Zed: Asistente y Agente DevHub_

---

## 1. Resumen ejecutivo

Hasta la Fase 10, las tools de Zed son código del repo. La **Fase 11** permite que **skills de terceros** (o del propio ecosistema DevHub) registren tools en Zed en tiempo de ejecución, sin modificar el core.

Esto permite, por ejemplo:

- Un skill de SEO que registre `analyze_seo`, `generate_meta_tags`.
- Un skill de diseño que registre `generate_brandkit`, `create_hyperframes`.
- Un skill interno de infraestructura que registre `deploy_preview`, `run_smoke_tests`.

---

## 2. Objetivos

- Permitir que un skill registre tools con nombre, descripción, schema y handler.
- Que Zed descubra skills disponibles en el workspace.
- Que el router de intenciones use tools de skills sin diferencia de las nativas.
- Garantizar sandbox y permisos: un skill no puede registrar tools que escapen de su alcance.
- Permitir desinstalar o deshabilitar skills.

---

## 3. Contrato de skill

Un skill es un directorio con:

```
my-skill/
  SKILL.md
  manifest.json
  tools/
    myTool.js
```

`manifest.json`:

```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "permissions": ["terminal", "browser", "filesystem:read"],
  "tools": [
    {
      "name": "my_tool",
      "description": "...",
      "parameters": { "url": { "type": "string" } }
    }
  ]
}
```

El handler es una función `execute(params, context)` que devuelve un resultado.

---

## 4. Componentes afectados

| Componente                                   | Cambio                                         |
| -------------------------------------------- | ---------------------------------------------- |
| `src/lib/asistente/skillRegistry.js` (nuevo) | Registro y descubrimiento de skills.           |
| `src/lib/asistente/tools/registry.js`        | Aceptar tools dinámicas además de nativas.     |
| `src/lib/asistente/zedIntentRouter.js`       | Considerar tools de skills en el routing.      |
| `src/lib/asistente/zedSecurityPolicy.js`     | Validar permisos del skill antes de ejecutar.  |
| `src/lib/asistente/ZedActivityDrawer.jsx`    | Mostrar qué skill ejecutó cada acción.         |
| `src/app/api/assistant/chat/route.js`        | Cargar skills del workspace al iniciar sesión. |

---

## 5. Flujo de registro

1. Al iniciar, Zed escanea `~/.config/devhub/skills/` y skills embebidos en el repo.
2. Valida `manifest.json` y permisos.
3. Carga handlers de tools.
4. Registra tools en `ToolRegistry` con prefijo del skill (`my_skill:my_tool`).
5. Incluye descripciones de tools en el system prompt.

---

## 6. Seguridad de skills

- Un skill solo puede usar permisos declarados.
- No puede acceder a variables de entorno salvo las explícitamente permitidas.
- No puede registrar tools con nombres que colisionen con tools nativas.
- Ejecución de handler en sandbox (Worker o process separado si es posible).
- Logs identifican siempre el skill de origen.

---

## 7. Criterios de aceptación

- [ ] Un skill de ejemplo se registra y responde a un comando de voz/texto.
- [ ] Tools de skills aparecen en el system prompt del LLM.
- [ ] El router puede elegir una tool de skill.
- [ ] Permisos no declarados son rechazados.
- [ ] Skills se pueden deshabilitar sin reiniciar.
- [ ] Tests de registro, ejecución y permisos de skills.
- [ ] Documentación para autores de skills.
- [ ] Commit checkpoint con `[git:checkpoint]`.

---

## 8. Tareas propuestas para DevHub MCP

1. Definir contrato y schema de skill.
2. Implementar `skillRegistry.js` con descubrimiento y validación.
3. Extender `ToolRegistry` para tools dinámicas.
4. Integrar skills en el system prompt y router.
5. Implementar validación de permisos.
6. Crear skill de ejemplo y tests.
7. Documentación para autores de skills.
8. Commit checkpoint Fase 11.
