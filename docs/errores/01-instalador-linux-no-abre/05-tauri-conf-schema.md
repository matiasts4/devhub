# Causa 5 — `tauri.conf.json` con campos inválidos bloqueaba el rebuild

## Problema

Al intentar regenerar el `.deb` para incluir las correcciones, el build fallaba en la fase de **validación de schema de Tauri**, antes de compilar cualquier código Rust.

Error exacto:

```
Error "tauri.conf.json" error on bundle > linux > deb: Additional properties are not allowed ('desktop' was unexpected)
Error "tauri.conf.json" error on bundle > linux: Additional properties are not allowed ('binaries' was unexpected)
```

El archivo `src-tauri/tauri.conf.json` tenía dos campos que no existen en el schema de Tauri v2:

**Campo 1 — `bundle.linux.deb.desktop`**

```json
"linux": {
  "deb": {
    "desktop": {          ← NO EXISTE en Tauri v2 schema
      "section": "Development",
      "priority": "optional"
    }
  }
}
```

La propiedad `desktop` bajo `linux.deb` no existe en el schema de Tauri v2. Los archivos desktop se configuran con `desktopTemplate` en `linux.deb`, no con un objeto anidado `desktop`.

**Campo 2 — `bundle.binaries`** (fuera de lugar)

```json
"linux": {
  "binaries": [           ← NO EXISTE bajo "linux" en Tauri v2 schema
    { "src": "...", "dest": "..." }
  ]
}
```

En Tauri v2, `binaries` no es un campo hijo de `linux`. La forma correcta de incluir ejecutables externos es `bundle.externalBin` en el nivel `bundle`, que ya estaba presente y funcionando.

## Corrección

Se eliminaron ambos campos del `tauri.conf.json`. El contenido funcional del `desktop` (`section`, `priority`) no tiene efecto en la generación del archivo desktop — el `.desktop` se genera a partir de la plantilla configurada en `linux.deb.desktopTemplate`, que no estaba configurada.

```json
// Después
"linux": {
  "deb": {
    "depends": ["libwebkit2gtk-4.1-0", "libgtk-3-0"],
    "files": {
      "../packaging/linux/devhub-launcher": "/usr/lib/DevHub/bin/devhub-launcher",
      "../packaging/linux/DevHub.desktop": "/usr/share/applications/DevHub.desktop"
    }
  }
}
// binaries se eliminó — externalBin ya cubría la necesidad
```

## Nota sobre el desktop entry del .deb

El archivo `DevHub.desktop` instalado en el sistema sigue siendo `Exec=devhub` (sin la ruta completa al launcher). Esto es porque la configuración `files` en Tauri copia archivos del source al paquete, pero el campo `desktop` en el schema de Tauri v2 solo acepta `desktopTemplate` como path a una plantilla, no un mapeo de archivos.

La cadena de launcher correcta es:

```
Icon/launcher → /usr/share/applications/DevHub.desktop → Exec=devhub → /usr/bin/devhub (ELF Tauri)
```

Y `devhub-server` (sidecar wrapper) se 安装 via `externalBin`.

Para que el launcher vaya por el wrapper `devhub-launcher`, se necesita o bien:

1. Cambiar el `.desktop` del sistema manualmente post-instalación
2. O ajustar el desktopTemplate de Tauri para generar el Exec correcto en el .deb

## Verificación

```bash
cd /home/matias/ArxonLabs/devhub
PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig:$PKG_CONFIG_PATH" \
  npx tauri build --bundles deb
# → Bundling DevHub_0.1.1_amd64.deb
#   Finished 1 bundle at: .../DevHub_0.1.1_amd64.deb
```

## Archivo

- `src-tauri/tauri.conf.json`