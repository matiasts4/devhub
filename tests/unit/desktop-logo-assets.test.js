const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');

function readCornerAlphas(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const script = `
const sharp = require('sharp');
(async () => {
  const image = sharp(process.argv[1]).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const points = [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
  ];
  const alphas = points.map(([x, y]) => {
    const index = (y * info.width + x) * info.channels;
    return data[index + 3];
  });
  process.stdout.write(JSON.stringify(alphas));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});`;

  return JSON.parse(
    execFileSync(process.execPath, ['-e', script, absolutePath], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
  );
}

describe('DevHub desktop logo assets', () => {
  test('regenerates packaged icons from the processed circular logo before Tauri icon generation', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const generateIconSource = fs.readFileSync(path.join(repoRoot, 'scripts/generate-icon.js'), 'utf8');

    expect(packageJson.scripts['generate-icon']).toContain('node scripts/generate-preview.js');
    expect(packageJson.scripts['generate-icon']).toContain('node scripts/generate-icon.js');
    expect(generateIconSource).toContain("../public/logo.png");
  });

  test('keeps transparent corners in processed and bundled app icons', () => {
    expect(readCornerAlphas('public/logo.png')).toEqual([0, 0, 0, 0]);
    expect(readCornerAlphas('public/logo-square.png')).toEqual([0, 0, 0, 0]);
    expect(readCornerAlphas('public/icons/icon-192x192.png')).toEqual([0, 0, 0, 0]);
    expect(readCornerAlphas('public/icons/icon-512x512.png')).toEqual([0, 0, 0, 0]);
    expect(readCornerAlphas('src-tauri/icons/32x32.png')).toEqual([0, 0, 0, 0]);
    expect(readCornerAlphas('src-tauri/icons/128x128.png')).toEqual([0, 0, 0, 0]);
    expect(readCornerAlphas('src-tauri/icons/icon.png')).toEqual([0, 0, 0, 0]);
  });
});
