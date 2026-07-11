# Optimización del peso de instaladores desktop

## Resumen ejecutivo

El instalador de DevHub desktop empaqueta una copia autónoma del servidor Next.js (standalone) junto con el binario de Tauri. La auditoría realizada sobre `src-tauri/resources/standalone.zip` identificó que más del **60% de su peso** corresponde a archivos que no son necesarios en tiempo de ejecución: símbolos de depuración, source maps, dependencias de build-time, datos de runtime y duplicados de módulos nativos.

Esta optimización reduce el peso del instalador sin instalar herramientas externas ni alterar la funcionalidad del runtime.

---

## Contexto del empaquetado

El flujo de build desktop está definido en `package.json`:

```json
"tauri:build": "node scripts/generate-icon-if-needed.cjs && npm run build:sidecar && node scripts/tauri-cli.cjs build"
```

Dentro de ese flujo, `tauri build` ejecuta el `beforeBuildCommand`:

```json
"build": "next build && node scripts/build-standalone-zip.cjs"
```

El script `scripts/build-standalone-zip.cjs` es el encargado de:

1. Tomar la salida standalone de Next.js (`.next/standalone`).
2. Copiar `public/` y `.next/static/`.
3. Copiar `src/lib/` para uso runtime.
4. Materializar symlinks de `node_modules` mediante `materialize-standalone-runtime.cjs`.
5. Comprimir todo en `src-tauri/resources/standalone.zip`.

El binario de Tauri luego lee ese recurso en `tauri.conf.json`:

```json
"resources": {
  "../sidecar-backend": "sidecar-backend",
  "../packaging/devhub-server.cjs": "devhub-server.cjs",
  "resources/standalone.zip": "standalone.zip",
  ...
}
```

---

## Auditoría de peso

Mediciones realizadas sobre `standalone.zip` antes de la optimización:

| Categoría                                         | Tamaño       | Notas                                                |
| ------------------------------------------------- | ------------ | ---------------------------------------------------- |
| **Tamaño total del zip**                          | **340.5 MB** |                                                      |
| Source maps + símbolos de depuración (.map, .pdb) | 101.1 MB     | Archivos de desarrollo; no requeridos en producción. |
| `sharp` y `@img/sharp-win32-x64`                  | 38.4 MB      | Solo se usa en build-time para generar iconos.       |
| Binarios/símbolos de `node-pty`                   | 32.6 MB      | Incluye .pdb y OpenConsole.exe duplicado.            |
| `public/` (logos e imágenes)                      | 28.0 MB      | Varios logos casi idénticos.                         |
| `better-sqlite3` (con duplicados)                 | 25.3 MB      | Incluye `sqlite3.c` de 9.4 MB por copia.             |
| Source maps de desarrollo de Next.js              | 24.4 MB      | Subconjunto de los 101 MB anteriores.                |
| `data/` (DB + backups + evidence)                 | 9.7 MB       | Datos de runtime; no deben distribuirse.             |
| Archivos de test                                  | 1.7 MB       | `.test.js`, `__tests__/`, etc.                       |

### Hallazgos clave

1. **`sharp` no se importa en `src/`**. Solo se usa en `scripts/generate-icon.js` y `scripts/generate-preview.js`. Next.js standalone lo incluye por defecto como dependencia transitiva, pero no es necesario en el servidor empaquetado porque `images.unoptimized: true` está configurado en `next.config.js`.

2. **Triple-duplicación de `better-sqlite3`**:
   - `.next/node_modules/better-sqlite3-XXXX/`: 11.7 MB
   - `node_modules/better-sqlite3/`: 11.7 MB
   - `node_modules/.pnpm/better-sqlite3@.../`: 1.9 MB

3. **`node-pty` incluye OpenConsole.exe en tres rutas** y archivos `.pdb` de debug que no son necesarios en producción.

4. **`data/` contiene `devhub.db`, backups automáticos y evidence markdown**. Estos son datos generados en runtime del usuario y no deben ir en el instalador.

5. **Next.js compiled incluye 48 MB de source maps**. En un build de producción no se sirven ni se necesitan para el funcionamiento de la aplicación.

---

## Cambios implementados

Archivo modificado: `scripts/build-standalone-zip.cjs`

Se agregaron las siguientes funciones de pruning antes de crear el zip:

### 1. `pruneSourceMapsAndSymbols()`

Elimina archivos `.map`, `.pdb` y `.tsbuildinfo` de todo el standalone.

**Impacto estimado:** ~101 MB.

### 2. `pruneTestFiles()`

Elimina archivos `*.test.*`, `*.spec.*` y directorios `__tests__`, `__mocks__`, `test`, `tests`.

**Impacto estimado:** ~1.7 MB.

### 3. `pruneSharpFromStandalone()`

Elimina todo `sharp-*` de `@img/` y el paquete `sharp` de `node_modules`, dado que no se usa en runtime.

**Impacto estimado:** ~38 MB.

### 4. `pruneBetterSqlite3DevFiles()`

Reduce cada copia de `better-sqlite3` manteniendo solo:

- `package.json`
- `build/Release/better_sqlite3.node`
- Lo estrictamente necesario para la carga del binding.

Elimina:

- `deps/sqlite3/sqlite3.c` (9.4 MB por copia)
- `src/`
- `build/Release/obj.target/`

**Impacto estimado:** ~15-20 MB.

### 5. `pruneNodePtySymbols()`

Elimina los archivos `.pdb` de los prebuilds de `node-pty`.

**Impacto estimado:** ~20 MB.

### 6. `dedupeNodePtyOpenConsole()`

Mantiene solo una copia de `OpenConsole.exe` (la de `prebuilds/win32-x64/conpty/`) y elimina las duplicadas en `build/Release/conpty/` y `third_party/conpty/`.

**Impacto estimado:** ~2-3 MB.

### 7. `pruneDataDirectory()`

Elimina la carpeta `data/` del standalone, ya que contiene bases de datos y backups de runtime.

**Impacto estimado:** ~10 MB.

---

## Resultados medidos

Valores obtenidos tras ejecutar `pnpm run tauri:build` con los cambios aplicados:

| Métrica                      | Antes    | Después  | Reducción        |
| ---------------------------- | -------- | -------- | ---------------- |
| `standalone.zip`             | 340.5 MB | 188.8 MB | -151.7 MB (~45%) |
| `DevHub_0.1.1_x64-setup.exe` | 70 MB    | 48 MB    | -22 MB (~31%)    |

La reducción del instalador NSIS es menor en porcentaje que la del zip porque NSIS ya comprime agresivamente; sin embargo, el usuario final descarga e instala un archivo **22 MB más ligero**, y el disco ocupado por la app instalada es significativamente menor.

---

## Riesgos y validación

| Riesgo                                                    | Mitigación                                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eliminar archivos necesarios para el runtime              | El script `materialize-standalone-runtime.cjs` sigue ejecutándose antes del pruning y `assertRequiredFiles()` verifica que `better-sqlite3`, `node-pty`, `ws`, `@swc/helpers` y `@next/env` estén presentes. |
| `sharp` realmente se use en alguna API route              | Se verificó con `grep` que no hay imports de `sharp` en `src/`. Las imágenes usan `unoptimized: true`.                                                                                                       |
| `.pdb` necesarios para diagnóstico de crash en producción | Los `.pdb` de `node-pty` son de terceros; para diagnóstico propio se pueden generar símbolos del binario Rust por separado.                                                                                  |
| `data/` necesaria en primer arranque                      | El runtime crea `~/.devhub/data/` en la primera ejecución. No requiere datos precargados.                                                                                                                    |

### Validación recomendada después del build

1. Verificar tamaño del zip:

   ```bash
   ls -lh src-tauri/resources/standalone.zip
   ```

2. Verificar que el instalador se genere:

   ```bash
   ls -lh src-tauri/target/release/bundle/nsis/DevHub_*_x64-setup.exe
   ```

3. Instalar y ejecutar la app en una máquina limpia (o VM) para confirmar que:
   - El sidecar inicia.
   - La base de datos se inicializa.
   - Los terminales funcionan.
   - Las imágenes se renderizan.

---

## Próximos pasos opcionales

1. **Optimizar `public/`**: consolidar los logos duplicados (`logo.png`, `logo-preview.png`, `logo-square.png`, `logo_oficial_clean.png`, `nuevoLogo.png`) en una o dos variantes y redimensionar/comprimir. Impacto potencial: ~15-20 MB adicionales.

2. **Cachear builds**: agregar `sccache` para reducir tiempos de compilación Rust. Nota: esto no reduce el peso del instalador, pero sí aceltra el build. Requiere espacio de disco para el cache.

3. **Paralelizar sidecar + Next build**: modificar el script de build para ejecutar `build:sidecar` y `next build` en paralelo. Impacto: reducción de tiempo total, no de peso.

4. **Feature flags en Rust**: modularizar módulos como `voice_python_setup`, `alacritty_terminal_host` y `native_window_host` para no compilarlos en la versión Windows si no se usan. Impacto: reducción moderada del binario Rust.

---

## Referencias

- `scripts/build-standalone-zip.cjs`
- `scripts/materialize-standalone-runtime.cjs`
- `next.config.js` (`images.unoptimized`, `output: 'standalone'`)
- `src-tauri/tauri.conf.json` (sección `bundle.resources`)
- `docs/18_Guia_Empaquetado_Desktop.md`
