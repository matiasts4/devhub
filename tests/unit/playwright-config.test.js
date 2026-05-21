const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPlaywrightConfig(env = {}) {
  const configPath = path.join(process.cwd(), 'playwright.config.ts');
  const source = fs.readFileSync(configPath, 'utf8');
  const transformed = source
    .replace(
      "import { defineConfig, devices } from '@playwright/test';",
      "const { defineConfig, devices } = require('@playwright/test');"
    )
    .replace('export default defineConfig(', 'module.exports = defineConfig(');

  const script = new vm.Script(transformed, { filename: configPath });
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require,
    process: { ...process, env: { ...process.env, ...env } },
    URL,
    __dirname: process.cwd(),
    __filename: configPath,
  };

  script.runInNewContext(sandbox);
  return module.exports;
}

describe('playwright.config.ts', () => {
  it('targets the Next dev server port by default', () => {
    const config = loadPlaywrightConfig({ BASE_URL: undefined });

    assert.equal(config.use.baseURL, 'http://localhost:3100');
    assert.equal(config.webServer.url, 'http://localhost:3100');
    assert.match(config.webServer.command, /next\s+dev\s+--port\s+3100/);
  });

  it('keeps browser and webServer URLs aligned when BASE_URL is overridden', () => {
    const config = loadPlaywrightConfig({ BASE_URL: 'http://127.0.0.1:4010' });

    assert.equal(config.use.baseURL, 'http://127.0.0.1:4010');
    assert.equal(config.webServer.url, 'http://127.0.0.1:4010');
    assert.match(config.webServer.command, /next\s+dev\s+--port\s+4010/);
  });

  it('scopes browser artifacts under the desktop QA bundle when QA_RUN_ID is present', () => {
    const config = loadPlaywrightConfig({ QA_RUN_ID: 'qa-20260521-001' });

    assert.equal(config.outputDir, 'test-results/desktop-qa/qa-20260521-001/browser/artifacts');
    assert.equal(config.reporter[0][0], 'html');
    assert.equal(
      config.reporter[0][1].outputFolder,
      'test-results/desktop-qa/qa-20260521-001/browser/playwright-report'
    );
    assert.equal(config.reporter[1][0], 'json');
    assert.equal(
      config.reporter[1][1].outputFile,
      'test-results/desktop-qa/qa-20260521-001/browser/results.json'
    );
  });
});
