// Playwright configuration for DevHub E2E tests

import { defineConfig, devices } from '@playwright/test';

const DEFAULT_BASE_URL = 'http://localhost:3100';
const resolvedBaseUrl = process.env.BASE_URL || DEFAULT_BASE_URL;
const resolvedPort = new URL(resolvedBaseUrl).port || '80';
const webServerCommand = `next dev --port ${resolvedPort}`;
const qaRunId = process.env.QA_RUN_ID;
const qaBrowserRoot = qaRunId ? `test-results/desktop-qa/${qaRunId}/browser` : null;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  ...(qaBrowserRoot ? { outputDir: `${qaBrowserRoot}/artifacts` } : {}),
  reporter: [
    [
      'html',
      { outputFolder: qaBrowserRoot ? `${qaBrowserRoot}/playwright-report` : 'playwright-report' },
    ],
    [
      'json',
      { outputFile: qaBrowserRoot ? `${qaBrowserRoot}/results.json` : 'test-results/results.json' },
    ],
  ],
  use: {
    baseURL: resolvedBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: resolvedBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
