# Tasks: Retry LLM Selector Fix

## Phase 1: Retry Infrastructure (server-side helpers)

- [x] 1.1 Crear `isRetryableError(error)` en `src/app/api/agenthub/chat/route.js`: detectar 429/500/503 por status, patrones en message/code ("overloaded", "rate_limit", "too_many_requests", "rate limited", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "socket hang up"). Retornar boolean.
- [x] 1.2 Crear `parseRetryAfter(error)` en `src/app/api/agenthub/chat/route.js`: extraer header `Retry-After` del error, soportar ms (<10000), segundos, HTTP-date. Retornar delay en ms o null.
- [x] 1.3 Crear `callWithRetry(fn, options)` en `src/app/api/agenthub/chat/route.js`: backoff exponencial `Math.min(1000 * 2^attempt, 30000)`, jitter ±200ms, max 3 intentos, respetar Retry-After si existe, propagar inmediatamente errores no reintentables.

## Phase 2: Retry Integration (server-side wiring)

- [x] 2.1 Envolver `openai.chat.completions.create()` (línea ~237) con `callWithRetry` en `src/app/api/agenthub/chat/route.js`. El retry aplica SOLO antes del stream.
- [x] 2.2 Verificar que errores no reintentables (400, 401, 403, 404) fallen inmediatamente sin reintento. Ver: spec scenario "Status code 401 is NOT retryable".

## Phase 3: Combined Favorites (client-side)

- [x] 3.1 Reemplazar líneas ~179-181 en `src/views/AgentHub.jsx`: cambiar `data.favoriteModels?.[detectedProvider]` por `Object.values(data.favoriteModels || {}).flat()` + `[...new Set(...)]` para combinar y deduplicar favoritos de todos los providers.
- [x] 3.2 Verificar que `setFavoriteModels()` reciba array combinado y que el componente `ChatInput` reciba el prop `favoriteModels` correcto. Ver: spec "Pass Combined List to ChatInput".

## Phase 4: Verification

- [x] 4.1 Test unitario inline: `isRetryableError()` con status 429 (retryable), 401 (no retryable), message "Overloaded" (retryable), "ECONNRESET" (retryable), error desconocido (no retryable).
- [x] 4.2 Test unitario inline: `parseRetryAfter()` con valor en segundos ("5"), HTTP-date, header ausente (null).
- [x] 4.3 Test unitario inline: `callWithRetry()` con mock — éxito en 1er intento, retry en 429, propagación en 401 sin reintento.
- [x] 4.4 Test manual: simular 429 en LLM provider, observar 2 reintentos en consola antes de éxito o fallo.
- [x] 4.5 Test manual: configurar favoritos en 2+ providers, verificar que el dropdown muestra todos combinados sin duplicados.
- [x] 4.6 Regression: verificar flujo de chat normal sin errores funciona sin cambios.
