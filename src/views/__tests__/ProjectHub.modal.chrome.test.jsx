// Regression: the "Nuevo Proyecto" modal must follow the active morphology
// token layer instead of hardcoded brutalist-stage chrome.

const fs = require('fs');
const path = require('path');

const PROJECT_HUB_PATH = path.resolve(__dirname, '../ProjectHub.jsx');

function readSource() {
  return fs.readFileSync(PROJECT_HUB_PATH, 'utf8');
}

function extractModalBlock(src) {
  const start = src.indexOf('{showNewModal && (');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("Crear Proyecto'", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end + 200);
}

describe('ProjectHub — new project modal chrome (morphology-aware)', () => {
  let src;
  let modalBlock;

  beforeAll(() => {
    src = readSource();
    modalBlock = extractModalBlock(src);
  });

  test('imports chrome factories from morphology', () => {
    expect(src).toMatch(/from\s+['"]@\/chrome\/morphology['"]/);
    expect(src).toMatch(/panelStyle/);
    expect(src).toMatch(/panelHeaderStripStyle/);
  });

  test('modal shell no longer hardcodes brutalist chrome', () => {
    expect(modalBlock).not.toMatch(/['"]8px 8px 0 0 var\(--border-strong\)['"]/);
    expect(modalBlock).not.toMatch(/['"]4px 4px 0 0 var\(--border-strong\)['"]/);
    expect(modalBlock).not.toMatch(/['"]3px 3px 0 0 var\(--border-strong\)['"]/);
    expect(modalBlock).not.toMatch(/border-2 border-\[var\(--border-strong\)\]/);
    expect(modalBlock).not.toMatch(/rounded-none/);
    expect(modalBlock).toMatch(/panelStyle\(\{\s*emphasized:\s*true\s*\}\)/);
  });
});