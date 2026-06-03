# Guía de Empaquetado y Release (Desktop App)

Este documento describe el flujo de construcción y empaquetado de la aplicación de escritorio DevHub (Tauri + Next.js Standalone + PTY).

## 1. El Problema que Resuelve esta Arquitectura

Históricamente, el empaquetado en Linux (AppImage/Deb) fallaba debido a:

1. **Límite de Archivos en `linuxdeploy`**: El directorio `node_modules` del servidor standalone contenía más de 40,000 archivos, lo que bloqueaba la herramienta de recolección de librerías de Tauri.
2. **Incompatibilidades de Glbc vs Musl**: Next.js incluía binarios precompilados de Alpine (`sharp-linuxmusl`), los cuales no eran compatibles con entornos basados en Debian/Ubuntu (glibc), crasheando la construcción.
3. **Recursividad de la build**: Archivos pesando GBs por copias recursivas de `src-tauri`.

**Solución Implementada ("El Zip Wrapper"):**
En lugar de pasar los 40,000 archivos a Tauri, el proceso empaqueta el servidor backend completamente en un único archivo `standalone.zip` y lo inyecta como "recurso" de Rust. En el primer lanzamiento, el binario envoltorio (wrapper) auto-extrae el zip silenciosamente en el home del usuario (`~/.devhub/standalone/`).

---

## 2. Instrucciones de Construcción (Build)

Para compilar y empaquetar una nueva versión de la aplicación para producción, debes seguir **exactamente** estos dos pasos en orden:

### Paso 1: Generar el Backend Standalone y el Zip

```bash
npm run build
```

**¿Qué hace debajo del capó este comando?**

- Compila el front/back de Next.js (`next build`).
- Mueve las carpetas estáticas (`public/` y `.next/static/`) dentro de `.next/standalone/`.
- Limpia los binarios conflictivos de C++ (`sharp*-linuxmusl*`).
- Genera el archivo comprimido final: `src-tauri/resources/standalone.zip`.

### Paso 2: Generar los Instaladores de tauri

```bash
npm run tauri:build
```

_(Si los builds cacheados de Cargo fallan previamente por algún motivo, corre `cd src-tauri && cargo clean && cd ..` antes de este paso)._

**Artifacts Generados:**
Al finalizar de manera correcta, Tauri pondrá a tu disposición los instaladores acá:

- **Debian/Ubuntu/Kali (.deb):** `src-tauri/target/release/bundle/deb/DevHub_X.X.X_amd64.deb`
- **Universales (.AppImage):** `src-tauri/target/release/bundle/appimage/DevHub_X.X.X_amd64.AppImage`
- **RedHat/Fedora (.rpm):** `src-tauri/target/release/bundle/rpm/DevHub-X.X.X.x86_64.rpm`

---

## 3. Guía de Instalación y Ejecución Local

### Para instalar la app nativamente (Recomendado):

El paquete `.deb` es la forma más limpia de utilizar DevHub, integrándose con el entorno de escritorio y creando los accesos directos (`.desktop`).

```bash
sudo apt install ./src-tauri/target/release/bundle/deb/DevHub_0.1.0_amd64.deb
```

Una vez instalado, la aplicación estará disponible en tu Menú de Aplicaciones buscándola como **"DevHub"**.
Alternativamente, se puede ejecutar mediante el comando que registró en los binarios del sistema (ej: `app` o `devhub`).

### Para probar el binario portable (AppImage):

```bash
./src-tauri/target/release/bundle/appimage/DevHub_0.1.0_amd64.AppImage
```

---

## 4. Estructura Interna del Binario (`devhub-server` Wrapper)

La magia autónoma del sistema reside en el script inyectado ubicado en `src-tauri/binaries/devhub-server-x86_64-unknown-linux-gnu`.

Este script bash cumple tres funciones vitales cuando el usuario hace clic en el icono de DevHub:

1. Revisa si existe la carpeta `~/.devhub/standalone`.
2. Si detecta que el `standalone.zip` empaquetado es más nuevo (actualización de app), extrae y reemplaza la base en `.devhub/`.
3. Levanta dos procesos atados al ciclo de vida general:
   - **Puerto 3000:** Instancia nativa de `node` corriendo el servidor web standalone.
   - **Puerto 4000:** Instancia nativa de PTY (Node-pty) corriendo los websockets de la terminal en background.

---

## 5. Lecciones Aprendidas y Solución de Problemas (Troubleshooting)

### A. Preservación de Enlaces Simbólicos (`pnpm`)

- **Problema:** Al utilizar Next.js Standalone en un monorepo administrado por `pnpm`, las dependencias de producción (ej. `@next/env`) se estructuran como symlinks enlazando a `.pnpm/`. Si el compresor `zip` dereferencia los symlinks a carpetas físicas o los omite, el servidor Next.js falla al iniciar arrojando `MODULE_NOT_FOUND`.
- **Solución:** Usar siempre la bandera `-y` en el comando `zip` (`zip -ry`) para guardar los enlaces simbólicos intactos dentro del archivo.

### B. Conflicto de Carpetas y Cuelgues en `unzip`

- **Problema:** La herramienta `zip` actualiza archivos preexistentes en lugar de borrarlos. Si se cambia un directorio por un symlink (o viceversa), el archivo zip contendrá entradas inválidas o duplicadas. Al extraer, `unzip` lanzará errores (código de retorno 50) y se colgará en segundo plano esperando confirmación interactiva del usuario. Esto hace que la aplicación de escritorio parezca no abrirse (bloqueo silencioso).
- **Solución:**
  1. En el script `build` de `package.json`, siempre ejecutar `rm -f src-tauri/resources/standalone.zip` antes de llamar a `zip`.
  2. Si ocurre un cuelgue silencioso luego de una actualización, limpie manualmente la carpeta cache local:
     ```bash
     pkill -9 -x devhub devhub-server sidecar-backend
     rm -rf ~/.devhub/standalone
     ```
