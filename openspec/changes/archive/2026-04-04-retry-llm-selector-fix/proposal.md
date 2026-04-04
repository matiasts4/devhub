# Proposal: Retry Logic + Combined Favorites Selector

## Intent

Resolver dos problemas de resiliencia y UX en AgentHub:

1. **Sin retry ante fallos LLM**: Cuando un proveedor devuelve error 429/500/503, el usuario ve un error inmediato sin reintento.
2. **Favoritos fragmentados por provider**: El dropdown de favoritos solo muestra modelos del provider activo, ocultando favoritos de otros providers configurados.

## Scope

### In Scope

- Retry con backoff exponencial (3 intentos, base 1s) en `src/app/api/agenthub/chat/route.js`
- Detección de errores retryables: status 429, 500, 503, mensajes "Overloaded", "rate_limit", "too_many_requests"
- Respetar header `Retry-After` si existe
- Combinar favoritos de TODOS los providers con deduplicación via `Set` en `src/views/AgentHub.jsx`

### Out of Scope

- Modificar componentes de UI (ChatInput.jsx ya recibe un array de strings)
- Cambiar estructura de datos del config (ya soporta favoritos por provider)
- Agregar dependencias npm
- Retry en el lado del cliente (`processLLM` en AgentHub.jsx)
- Reintentar un stream ya iniciado (solo aplica al error inicial de `create()`)

## Capabilities

### New Capabilities

- `chat-retry-logic`: Retry con backoff exponencial en el endpoint de chat del servidor
- `combined-favorites-selector`: Combinar favoritos de todos los providers en el dropdown

### Modified Capabilities

- None

## Approach

### Retry Logic (Server-side)

Crear función `callWithRetry(openai, params)` que envuelve `openai.chat.completions.create()`:

- `MAX_RETRIES = 3`, `BASE_DELAY_MS = 1000`
- Delay exponencial: `Math.min(BASE_DELAY_MS * 2^attempt, 30000)` + jitter aleatorio (±200ms)
- Detectar retryables: `error.status` en {429, 500, 503} o `error.message` contiene "Overloaded", "rate_limit", "too_many_requests"
- Priorizar header `Retry-After` sobre el cálculo exponencial si existe
- Si no es retryable o se agotan intentos, propagar error original al catch de la route

**Nota crítica**: El retry solo funciona ANTES de que el stream comience. Una vez que `create()` retorna un stream iterable, los errores dentro del `for await` (línea 255) NO son reintentables — esos ya se manejan con el bloque try/catch interno del stream.

### Combined Favorites (Client-side)

En el `useEffect` que carga la config (línea ~151-185 de AgentHub.jsx):

- **Antes** (línea 179): `data.favoriteModels[detectedProvider]`
- **Después**: `Object.values(data.favoriteModels || {}).flat()` → deduplicar con `Set` por campo `model` → convertir a array

El resultado se pasa a `ChatInput` via prop `favoriteModels` (ya espera un array de strings).

## Affected Areas

| Area                                 | Impact   | Description                                                                         |
| ------------------------------------ | -------- | ----------------------------------------------------------------------------------- |
| `src/app/api/agenthub/chat/route.js` | Modified | Agregar `callWithRetry()` y envolver `openai.chat.completions.create()` (línea 237) |
| `src/views/AgentHub.jsx`             | Modified | Combinar favoritos de todos los providers en useEffect de config (línea ~179)       |

## Risks

| Risk                                                            | Likelihood | Mitigation                                                                                |
| --------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| Retry colisiona con timeout del cliente en `processLLM`         | Medium     | El cliente no tiene timeout explícito — el AbortController solo se activa con stop manual |
| Duplicados en favoritos si mismo modelo en múltiples providers  | Medium     | Deduplicación via Set con key `model`                                                     |
| Latencia percibida alta durante retry (hasta ~14s en peor caso) | Low        | Solo 3 intentos con backoff; el usuario ve indicador de "pensando..."                     |
| Jitter insuficiente causa thundering herd en rate limits        | Low        | Agregar ±200ms de jitter aleatorio al delay                                               |

## Rollback Plan

1. `git revert` del commit que introduce los cambios
2. El retry logic es aditivo — eliminar la función wrapper restaura comportamiento original
3. Los favoritos combinados se revierten volviendo a `data.favoriteModels[detectedProvider]`

## Dependencies

- Ninguna (no se agregan dependencias npm)

## Success Criteria

- [ ] Error 429/500/503 del LLM dispara reintentos automáticos (máx 3) con backoff exponencial
- [ ] Header `Retry-After` es respetado cuando está presente
- [ ] El dropdown de favoritos muestra modelos de TODOS los providers configurados
- [ ] No hay duplicados en la lista de favoritos combinados
- [ ] Errores no-retryables (401, 404, etc.) se propagan inmediatamente sin reintento
