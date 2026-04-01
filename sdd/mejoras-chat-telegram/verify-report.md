## Reporte de Mejoras: Telegram Bot & OpenCode Sessions

### 1. Robustez del Formato (Markdown V2 Crashing)
- **Archivo**: `telegram-bot/commands/chat.js`
- **Problema**: El manejador de respuestas largas corta el texto (substring) de 4000 en 4000 caracteres debido al límite de Telegram (`TELEGRAM_LIMIT = 4096`).
- **Impacto**: Si el bot devuelve un bloque de código GIGANTE que pesa más de 4000 caracteres, o la partición cae en el medio de un tag (ej: corta un ```), el parseador de Telegram tirará un error 400 por MarkdownV2 malformado.
- **Mejora**: Un script de particionamiento inteligente o semántico que respete saltos de línea y bloques de código, enviando los chunks de forma segura.

### 2. Sobrecrecimiento del Context Window (Token Bloat)
- **Archivo**: `telegram-bot/services/conversation.js`
- **Problema**: `maxMessages` está hardcodeado a 20. 
- **Impacto**: Si un LLM devuelve salidas largas recurrentes, 20 interacciones podrían ser rápidamente decenas de miles de caracteres (~30/40K tokens), empujando queries excesivas al LLM y sufriendo *attention drop*.
- **Mejora**: En vez de "truncar por cantidad de mensajes", truncar el historial "por cantidad global de tokens o largo de string", o implementar un aviso automático en Telegram onda: *"El contexto está pesando 15,000 caracteres, te sugiero hacer un /reset si vas a cambiar de tema"*.

### 3. Latencia Inducida en Respuestas 
- **Archivo**: `telegram-bot/services/opencode.js`
- **Problema**: `POLL_INTERVAL = 3_000` ms (3 segundos)
- **Impacto**: Como OpenCode se ejecuta adentro de `tmux`, el script revisa el output cada 3 segundos en busca del command prompt final. Esto significa que a veces hay hasta 2.99s de delay inyectado artificialmente entre que el agente terminó de hablar y el celular recibe el texto.
- **Mejora**: Reducir el polleo a `1_000` o `500` ms (totalmente seguro y de bajísimo consumo).

### 4. Over-Sanitization (Falsos Positivos)
- **Archivo**: `telegram-bot/services/opencode.js` (Función `cleanOutput`)
- **Problema**: Las expresiones regulares están diseñadas para atrapar y matar muchísimos caracteres de progreso (`/\[[═━─━═\s=>·]+\]\s*\d*%?\s*/g`).
- **Impacto**: Si la respuesta del modelo **intencionalmente** lleva barras de progreso porque el usuario lo pidió o el código a analizar las tiene, el REGEX se las come cruditas y al usuario le llega un texto mutilado.
- **Mejora**: Refinar las REGEX apoyándose solo en remover marcadores y JSON de tools y no en strings puramente visuales.

### 5. Resiliencia de Desconexiones a la API de DevHub
- **Archivo**: `telegram-bot/services/api.js`
- **Problema**: Llama a DevHub por HTTP. Si DevHub Next.js (`http://localhost:3000`) se reinicia al momento de despachar un `/spawn`.
- **Impacto**: Telegram devuelve un crac en bruto de "fetch error".
- **Mejora**: Un mecanismo de reintentos para consultas de estado (`/progreso`, `/estado`), ya que DevHub suele reiniciarse seguido.
