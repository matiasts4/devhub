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
});
