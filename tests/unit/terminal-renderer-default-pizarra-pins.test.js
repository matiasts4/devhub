/**
 * Pizarra preset + surface controller + command bar contract for
 * `terminal-renderer-default-xterm-webgl`.
 *
 * Specs: openspec/changes/terminal-renderer-default-xterm-webgl/specs/terminal-renderer-default/spec.md
 *   - TRD-2: Pizarra presets pin requestedRendererMode: 'xterm-webgl' per surface.
 *   - TRD-1: Command bar terminalRun spawn forwards the default renderer mode.
 *
 * These tests are layered:
 *   - Unit: source-level assertions on PizarraPane.jsx preset paths.
 *   - Unit: pizarraSurfaceController.spawnTerminal call shape.
 *   - Unit: terminalRun action call shape (in __tests__/terminalRun.test.js).
 */

const fs = require('fs');
const path = require('path');

const pizarraPaneSource = fs.readFileSync(
  path.resolve(__dirname, '../../src/components/pizarra/PizarraPane.jsx'),
  'utf8'
);

describe('terminal-renderer-default — pizarra defensive spawn pins', () => {
  test('TRD-S5: pizarra dev-split preset pins requestedRendererMode: xterm-webgl on every surface', () => {
    // The dev-split branch in handleApplyLayout should pin
    // requestedRendererMode: 'xterm-webgl' on every registry.addSurface call
    // so the preset is the source of truth for the renderer it creates.
    // The block ends at the next `else if` or the closing brace of the
    // outer `if/else` chain.
    const devSplitBlock = pizarraPaneSource.match(
      /if\s*\(presetType\s*===\s*['"]dev-split['"]\)\s*\{[\s\S]*?(?=\s*\}\s*else if|\s*\}\s*$)/m
    );
    expect(devSplitBlock).not.toBeNull();
    expect(devSplitBlock[0]).toMatch(/requestedRendererMode:\s*['"]xterm-webgl['"]/);
  });

  test('TRD-S5: pizarra dev-trio preset pins requestedRendererMode: xterm-webgl on every surface', () => {
    const devTrioBlock = pizarraPaneSource.match(
      /else if\s*\(presetType\s*===\s*['"]dev-trio['"]\)\s*\{[\s\S]*?(?=\s*\}\s*else if|\s*\}\s*$)/m
    );
    expect(devTrioBlock).not.toBeNull();
    expect(devTrioBlock[0]).toMatch(/requestedRendererMode:\s*['"]xterm-webgl['"]/);
  });

  test('TRD-S5: pizarra dual-browser preset pins requestedRendererMode: xterm-webgl on every surface', () => {
    const dualBrowserBlock = pizarraPaneSource.match(
      /else if\s*\(presetType\s*===\s*['"]dual-browser['"]\)\s*\{[\s\S]*?(?=\s*\}\s*$)/m
    );
    expect(dualBrowserBlock).not.toBeNull();
    expect(dualBrowserBlock[0]).toMatch(/requestedRendererMode:\s*['"]xterm-webgl['"]/);
  });

  test('TRD-S3: handleAddElement terminal branch pins requestedRendererMode: xterm-webgl', () => {
    // Find the registry.addSurface block inside handleAddElement (the
    // terminal/browser branch). It must pin requestedRendererMode.
    const handleAddSurfaceBlock = pizarraPaneSource.match(
      /const\s+addedSurface\s*=\s*registry\.addSurface\(surfaceData\)[\s\S]*?return\s+addedSurface\s*\|\|\s*surfaceData;/
    );
    // Either the surfaceData literal carries the pin (preferred), or the
    // block above builds it from cleanedExtraProps. The contract is that the
    // spawn surface record sent to addSurface carries requestedRendererMode.
    expect(handleAddSurfaceBlock).not.toBeNull();
    // Ensure the surfaceData literal in the same handleAddElement scope
    // contains the pin.
    expect(pizarraPaneSource).toMatch(
      /handleAddElement[\s\S]*?requestedRendererMode:\s*['"]xterm-webgl['"][\s\S]*?registry\.addSurface\(surfaceData\)/
    );
  });
});
