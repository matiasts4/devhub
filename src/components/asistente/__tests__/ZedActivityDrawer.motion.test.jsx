'use strict';

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve(__dirname, '..', 'ZedActivityDrawer.jsx');

function readFile() {
  return fs.readFileSync(FILE_PATH, 'utf8');
}

describe('ZedActivityDrawer — motion preset migration', () => {
  let source;

  beforeAll(() => {
    source = readFile();
  });

  test('imports useMotionMode from the global motion context', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\buseMotionMode\b[^}]*\}\s*from\s+['"]@\/components\/ui\/motion\/MotionModeContext['"]/
    );
  });

  test('imports getTransition from motion-tokens', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bgetTransition\b[^}]*\}\s*from\s+['"]@\/components\/ui\/system\/motion-tokens['"]/
    );
  });

  test('drawer transition uses the open preset', () => {
    expect(source).toMatch(/transition=\{getTransition\(['"]open['"],\s*motionMode\)\}/);
  });

  test('no longer hardcodes duration/ease for drawer motion', () => {
    expect(source).not.toMatch(/duration:\s*0\.24/);
    expect(source).not.toMatch(/ease:\s*\[0\.22,\s*1,\s*0\.36,\s*1\]/);
  });

  test('does not animate layout properties', () => {
    const drawerMatch = source.match(/key=["']zed-activity-drawer["'][\s\S]*?\u003e/);
    expect(drawerMatch).not.toBeNull();
    const drawerBlock = drawerMatch[0];
    expect(drawerBlock).not.toMatch(/\bheight:\s*0/);
    expect(drawerBlock).not.toMatch(/height:\s*['"]auto['"]/);
  });

  test('width comes from the widthPx prop (ZedOverlaySettings drawer width control)', () => {
    expect(source).toMatch(/widthPx\s*=\s*400/);
    expect(source).not.toMatch(/w-\[min\(400px/);
    expect(source).toMatch(/width:\s*`min\(\$\{widthPx\}px,\s*calc\(100vw - 1\.5rem\)\)`/);
  });
});
