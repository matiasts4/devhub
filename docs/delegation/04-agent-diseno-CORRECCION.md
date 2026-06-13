# Prompt corrección — Agente 04 Diseño (P0 Ajustes apariencia)

> Usar después de la verificación. **No archivar** `sdd/ui-professionalization` hasta cerrar esto.

## Problema

En `/#/project/:id/ajustes`, pestaña apariencia:
- Ya no hay controles de tema/morfología/accent (solo resumen read-only).
- Botón **"Open new settings"** hace `navigate('/settings/appearance')` → ruta **inexistente** en HashRouter → pantalla vacía.

`/settings/appearance` (Next App Router) funciona solo con URL directa Next, no desde el SPA.

## Fix requerido (decisión producto)

**Restaurar controles interactivos en `src/views/Ajustes.jsx`** como antes del commit `a131a57`.

- Grid de temas con previews
- Selector morfología + palette switchyard
- Selector accent
- Controles deben seguir usando `setTheme`, `setMorphology`, `setAccent`, `setPalette` de `@/lib/theme/themes`

El banner de deprecación es opcional; si se mantiene, **no** debe ser el único camino. Eliminar o desactivar botón `Open new settings` que navega a ruta rota.

## Archivos

- `src/views/Ajustes.jsx` — restaurar `renderThemeTab` interactivo (ver git `a131a57^`)
- `src/views/__tests__/Ajustes.appearance.test.jsx` — tests deben exigir controles interactivos, no solo banner
- `sdd/ui-professionalization/spec.md` — corregir FR-D02.S1 (no asumir `navigate('/settings/appearance')` como única UI en SPA)
- `sdd/ui-professionalization/verify-report.md` — cambiar veredicto a PASS WITH REGRESSION FIXED tras fix

## Fuera de alcance

- No rehacer migraciones Dashboard/ProjectHub/Roadmap ya hechas
- No tocar otros agentes (terminales, zed, pizarra)

## Verificación

1. Manual: `ajustes` → cambiar tema y morfología → persiste tras reload
2. `npm test -- --testPathPattern=Ajustes.appearance`
3. Confirmar que "Open new settings" ya no lleva a pantalla vacía (eliminado o arreglado)

## Comando útil

```bash
git show a131a57^:src/views/Ajustes.jsx | head -n 1200  # ver versión anterior del tab apariencia
```
