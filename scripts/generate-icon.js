const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function generateSquareIcon() {
  const inputPath = path.join(__dirname, '../public/logo.png');
  const outputPath = path.join(__dirname, '../public/logo-square.png');

  console.log('📦 Generando icono cuadrado desde:', inputPath);

  const metadata = await sharp(inputPath).metadata();

  console.log(`📐 Dimensiones originales: ${metadata.width}x${metadata.height}`);

  const alphaStats = await sharp(inputPath)
    .ensureAlpha()
    .extractChannel('alpha')
    .stats();

  const hasTransparency = alphaStats.channels?.[0]?.min < 255;

  const pipeline = sharp(inputPath).ensureAlpha();

  if (hasTransparency) {
    const squareSize = Math.max(metadata.width, metadata.height);
    await pipeline
      .resize(squareSize, squareSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(outputPath);

    console.log(`✅ Icono cuadrado generado con padding transparente: ${squareSize}x${squareSize}`);
  } else {
    const size = Math.min(metadata.width, metadata.height);
    await pipeline
      .resize(size, size, {
        fit: 'cover',
        position: 'centre',
      })
      .png()
      .toFile(outputPath);

    console.log(`✅ Icono cuadrado generado por recorte central: ${size}x${size}`);
  }

  console.log(`📁 Guardado en: ${outputPath}`);

  return outputPath;
}

async function generatePwaIcons(squarePath) {
  const iconsDir = path.join(__dirname, '../public/icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const sizes = [192, 512];
  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    await sharp(squarePath)
      .ensureAlpha()
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outputPath);
    console.log(`✅ PWA icon generado: ${outputPath}`);
  }
}

if (require.main === module) {
  generateSquareIcon()
    .then(async (squarePath) => {
      await generatePwaIcons(squarePath);
      console.log('\n🎉 ¡Listo! Ahora ejecuta:');
      console.log('npx @tauri-apps/cli icon public/logo-square.png -o src-tauri/icons');
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = { generateSquareIcon, generatePwaIcons };
