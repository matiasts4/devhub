// Regression test for Bug: Ajustes project-type and documentation-policy sections
// apply a hardcoded brutalist chrome (`borderRadius: 0` and the literal
// `'4px 4px 0 0 var(--border-strong)'` shadow) regardless of the active
// `[data-morphology]` block.
//
// The two offending code blocks (around src/views/Ajustes.jsx:770-800 for
// project-type buttons and 817-832 for documentation-policy buttons) should
// delegate to the `panelStyle()` factory so the morphology token layer can
// decide the actual radius and shadow. Other appearance-deprecation banners
// in Ajustes are intentionally left untouched.
//
// This test reads the Ajustes.jsx source directly and asserts that the
// project-type and doc-policy buttons no longer carry the offending
// hardcoded chrome.

const fs = require('fs');
const path = require('path');

const AJUSTES_PATH = path.resolve(__dirname, '../Ajustes.jsx');

function readSource() {
  return fs.readFileSync(AJUSTES_PATH, 'utf8');
}

describe('Ajustes — project-type and doc-policy chrome (morphology-aware)', () => {
  let src;

  beforeAll(() => {
    src = readSource();
  });

  test('project-type button style no longer hardcodes brutalist chrome', () => {
    // Match the project-type <button> onClick={() => setProjectType(value)} ...
    // </button> block and assert none of the offending patterns appear inside.
    const re = /onClick=\{\(\) => setProjectType\(value\)\}([\s\S]*?)<\/button>/;
    const match = src.match(re);
    expect(match).not.toBeNull();
    const block = match[1];

    expect(block).not.toMatch(/['"]4px 4px 0 0 var\(--border-strong\)['"]/);
    expect(block).not.toMatch(/borderRadius:\s*0/);
    expect(block).not.toMatch(/rounded-none/);
  });

  test('doc-policy button style no longer hardcodes brutalist chrome', () => {
    // Match the doc-policy <button> onClick={() => setDocumentationPolicy(value)} ...
    // </button> block.
    const re = /onClick=\{\(\) => setDocumentationPolicy\(value\)\}([\s\S]*?)<\/button>/;
    const match = src.match(re);
    expect(match).not.toBeNull();
    const block = match[1];

    expect(block).not.toMatch(/['"]4px 4px 0 0 var\(--border-strong\)['"]/);
    expect(block).not.toMatch(/borderRadius:\s*0/);
    expect(block).not.toMatch(/rounded-none/);
  });
});
