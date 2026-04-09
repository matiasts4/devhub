# Generación de Iconos para DevHub

## Problema Actual
El logo actual (`public/logo.png`) es 1344x768 (no cuadrado), pero Tauri requiere un icono cuadrado para generar todos los tamaños necesarios.

## Solución

### Opción 1: Usar una herramienta online
1. Ir a https://www.iloveimg.com/crop-image o similar
2. Subir `public/logo.png`
3. Recortar a formato cuadrado (1024x1024 recomendado)
4. Guardar como `public/logo-square.png`

### Opción 2: Usar ImageMagick (si está instalado)
```bash
# Instalar ImageMagick
sudo apt-get install imagemagick  # Ubuntu/Debian
# o
brew install imagemagick  # macOS

# Crear versión cuadrada con padding
convert public/logo.png -gravity center -background transparent -extent 1344x1344 public/logo-square.png
```

### Opción 3: Usar GIMP o Photoshop
1. Abrir `public/logo.png`
2. Cambiar tamaño del canvas a 1344x1344 (centrado)
3. Exportar como `public/logo-square.png`

## Generar Iconos de Tauri

Una vez que tengas el logo cuadrado:

```bash
npx @tauri-apps/cli icon public/logo-square.png -o src-tauri/icons
```

Esto generará automáticamente todos los tamaños necesarios:
- 32x32.png
- 128x128.png
- 128x128@2x.png
- icon.icns (macOS)
- icon.ico (Windows)
- Y todos los tamaños para Windows Store

## Cambios Aplicados

✅ Configuración de Tauri actualizada con `transparent: true` para soportar bordes redondeados
✅ Estilos CSS agregados para bordes redondeados (12px) y borde sutil
✅ Box-shadow inset para borde visual de la ventana

## Próximos Pasos

1. Crear logo cuadrado usando una de las opciones anteriores
2. Ejecutar el comando de generación de iconos
3. Reconstruir la aplicación Tauri: `npm run tauri:build`
