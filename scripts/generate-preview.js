const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

/**
 * Toma el logo oficial, elimina el fondo negro si existe,
 * lo normaliza a un círculo y lo exporta como PNG con alpha.
 *
 * Fuente:  public/logo_oficial.* | public/fondo_oficial.jpeg | public/logo-original.png
 * Salidas: public/logo.png           (logo procesado, usado por la app y Tauri)
 *          public/logo-preview.png   (copia de previsualización)
 */
function resolveInputPath() {
  const candidates = [
    '../public/logo_oficial.png',
    '../public/logo_oficial.jpg',
    '../public/logo_oficial.jpeg',
    '../public/logo_oficial.webp',
    '../public/fondo_oficial.jpeg',
    '../public/logo-original.png',
  ];

  for (const candidate of candidates) {
    const resolved = path.join(__dirname, candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  throw new Error('No se encontro ningun logo fuente en public/logo_oficial.* ni public/fondo_oficial.jpeg');
}

async function buildLogo() {
  const inputPath = resolveInputPath();
  const outputLogo = path.join(__dirname, '../public/logo.png');
  const outputPrev = path.join(__dirname, '../public/logo-preview.png');
  const outputClean = path.join(__dirname, '../public/logo_oficial_clean.png');

  const image = sharp(inputPath);
  const metadata = await image.metadata();

  const trimmed = await image
    .trim({ background: { r: 0, g: 0, b: 0 }, threshold: 18 })
    .toBuffer();

  const trimmedMeta = await sharp(trimmed).metadata();
  const size = Math.max(trimmedMeta.width || metadata.width || 0, trimmedMeta.height || metadata.height || 0);
  const containerSize = Math.round(size * 1.08);

  const circleMask = Buffer.from(
    `<svg width="${containerSize}" height="${containerSize}">
      <circle cx="${containerSize / 2}" cy="${containerSize / 2}" r="${containerSize / 2}" fill="white" />
    </svg>`
  );

  const processed = await sharp(trimmed)
    .resize(containerSize, containerSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  await sharp(processed).toFile(outputLogo);
  await sharp(processed).toFile(outputPrev);
  await sharp(processed).toFile(outputClean);

  console.log(`✅ logo.png generado  → ${outputLogo}`);
  console.log(`✅ logo-preview.png   → ${outputPrev}`);
  console.log(`✅ logo_oficial_clean.png → ${outputClean}`);
  console.log(
    `📐 Tamaño: ${containerSize}x${containerSize}px (desde ${metadata.width}x${metadata.height}, recortado a ${trimmedMeta.width}x${trimmedMeta.height})`
  );
}

buildLogo().catch((err) => {
  console.error('Error al generar logo:', err);
  process.exit(1);
});
