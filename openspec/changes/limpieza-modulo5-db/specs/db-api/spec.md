# Delta Spec: DB API

## ADDED Requirements

### Requirement: Validación de Nombres de Tabla en Query Route

El sistema DEBE validar los nombres de tabla recibidos en `/api/db/query/route.js` contra un whitelist definido en `localDb.tables` antes de ejecutar cualquier consulta.

#### Scenario: Nombre de tabla válido es aceptado

- GIVEN un cliente envía una consulta con un nombre de tabla que existe en `localDb.tables`
- WHEN la route procesa la solicitud
- THEN la consulta se ejecuta normalmente
- AND se retorna el resultado esperado

#### Scenario: Nombre de tabla inválido es rechazado

- GIVEN un cliente envía una consulta con un nombre de tabla que NO existe en `localDb.tables`
- WHEN la route procesa la solicitud
- THEN la consulta NO se ejecuta
- AND se retorna un error HTTP 400 con mensaje descriptivo
- AND se registra el intento de acceso a tabla inválida

#### Scenario: Intento de inyección SQL mediante nombre de tabla

- GIVEN un cliente envía un nombre de tabla con caracteres especiales o sintaxis SQL
- WHEN la route valida el nombre
- THEN el nombre es rechazado por no estar en el whitelist
- AND no se ejecuta ninguna consulta contra la base de datos

### Requirement: Sanitización de Input FTS5 en searchTraces()

El sistema DEBE sanitizar el input de usuario antes de pasarlo a consultas FTS5 en la función `searchTraces()` de `localDb.js`, escapando todos los caracteres especiales de FTS5.

#### Scenario: Búsqueda con caracteres especiales es sanitizada

- GIVEN un usuario busca un término que contiene caracteres especiales de FTS5 (`"`, `*`, `-`, `+`, `(`, `)`, `/`, `\`, `:`, `^`, `$`, `~`)
- WHEN `searchTraces()` procesa la búsqueda
- THEN los caracteres especiales se escapan correctamente
- AND la búsqueda se ejecuta sin errores de sintaxis FTS5

#### Scenario: Búsqueda con operadores booleanos es sanitizada

- GIVEN un usuario busca un término que contiene `AND`, `OR`, o `NOT`
- WHEN `searchTraces()` procesa la búsqueda
- THEN los operadores se escapan para que se traten como texto literal
- AND la búsqueda retorna resultados que contienen esas palabras

#### Scenario: Búsqueda válida sin caracteres especiales funciona normalmente

- GIVEN un usuario busca un término sin caracteres especiales (ej: "error login")
- WHEN `searchTraces()` procesa la búsqueda
- THEN la búsqueda FTS5 se ejecuta normalmente
- AND se retornan los resultados esperados

## MODIFIED Requirements

### Requirement: Uso de Conexión DB Compartida en Metrics API

El sistema DEBE usar `getDb()` de `localDb.js` para obtener la conexión a la base de datos en `src/app/api/metrics/route.js` en lugar de abrir una conexión independiente con `new Database()`.

(Previously: Metrics API abría su propia conexión a la base de datos con `new Database()`)

#### Scenario: Metrics API usa conexión compartida

- GIVEN un cliente solicita métricas desde `/api/metrics`
- WHEN la route procesa la solicitud
- THEN usa `getDb()` de `localDb.js` para obtener la conexión
- AND NO se crea una nueva instancia de `Database()`

#### Scenario: Múltiples requests comparten la misma conexión

- GIVEN múltiples clientes solicitan métricas simultáneamente
- WHEN las requests se procesan
- THEN todas usan la misma conexión obtenida vía `getDb()`
- AND no se crean conexiones adicionales

### Requirement: Tabla agent_logs en Schema de Runtime

El sistema DEBE incluir la tabla `agent_logs` en la función `ensureRuntimeSchema()` de `localDb.js` para que se cree automáticamente al iniciar la aplicación.

(Previously: `ensureRuntimeSchema()` no incluía la tabla `agent_logs`)

#### Scenario: Tabla agent_logs se crea al iniciar

- GIVEN la aplicación se inicia y `ensureRuntimeSchema()` se ejecuta
- WHEN se verifica el schema de la base de datos
- THEN la tabla `agent_logs` existe
- AND tiene la estructura correcta de columnas

#### Scenario: Tabla agent_logs no se duplica si ya existe

- GIVEN la tabla `agent_logs` ya existe en la base de datos
- WHEN `ensureRuntimeSchema()` se ejecuta nuevamente
- THEN la tabla NO se recrea ni se modifica
- AND no hay errores de "table already exists"
