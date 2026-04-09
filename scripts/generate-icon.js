const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function generateSquareIcon() {
  const inputPath = path.join(__dirname, '../public/logo.png');
  const outputPath = path.join(__dirname, '../public/logo-square.png');

  console.log('📦 Generando icono cuadrado desde:', inputPath);

  const image = sharp(inputPath);
  const metadata = await image.metadata();
  
  console.log(`📐 Dimensiones originales: ${metadata.width}x${metadata.height}`);

  // Usar el lado menor como tamaño del cuadrado + cover para cropear el centro
  // El logo es landscape (1344x768) con el círculo centrado → cover da el cuadrado central exacto
  const size = Math.min(metadata.width, metadata.height);
  
  await image
    .resize(size, size, {
      fit: 'cover',
      position: 'centre'
    })
    .png()
    .toFile(outputPath);

  console.log(`✅ Icono cuadrado generado: ${size}x${size}`);
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
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = { generateSquareIcon, generatePwaIcons };
