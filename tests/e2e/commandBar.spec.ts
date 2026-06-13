import { test, expect } from '@playwright/test';

/**
 * E2E Tests — CommandBar (Native Command Executor Assistant)
 * 
 * Tests verify visible execution flows for CommandBar intents:
 * - Terminal-run: Open CommandBar → type command → see terminal surface
 * - Browser-navigate: Open CommandBar → type URL → see browser surface  
 * - Terminal-read: Open CommandBar → read terminal → see result display
 * - Feature flag gating
 * 
 * **Execution Note**: These tests require desktop/native runtime with surface spawning capabilities.
 * If runtime unavailable, tests will be skipped with pending status.
 */

test.describe('CommandBar E2E — Terminal Run Intent', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app (adjust URL based on environment)
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('CommandBar opens with keyboard shortcut Cmd+Shift+K', async ({ page }) => {
    // Open CommandBar via keyboard (Mac: Cmd+Shift+K, Windows/Linux: Ctrl+Shift+K)
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    // Verify CommandBar dialog is visible
    const commandBar = page.locator('[role="dialog"]').filter({ hasText: /command bar/i });
    await expect(commandBar).toBeVisible({ timeout: 2000 });
    
    // Verify input field is visible and focused
    const input = page.locator('[role="combobox"]');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test('terminal-run intent spawns visible terminal', async ({ page, context }) => {
    const isMac = process.platform === 'darwin';
    
    // Open CommandBar
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    const input = page.locator('[role="combobox"]');
    await expect(input).toBeVisible();
    
    // Type command
    await input.fill('echo "Hello from CommandBar E2E"');
    
    // Submit with Enter
    await page.keyboard.press('Enter');
    
    // Verify status transitions (queued → running → done)
    const statusRegion = page.locator('[role="status"]');
    
    // Wait for queued or running status
    await expect(statusRegion).toBeVisible({ timeout: 3000 });
    
    // Wait for done status or CommandBar auto-close
    await page.waitForTimeout(1500);
    
    // Verify terminal surface spawned (look for xterm canvas or terminal indicator)
    const terminalSurface = page.locator('.xterm, canvas.xterm-canvas, [data-surface-type="terminal"]');
    await expect(terminalSurface.first()).toBeVisible({ timeout: 5000 });
    
    // Verify command output appears in terminal
    const terminalText = page.locator('text=/Hello from CommandBar E2E/i');
    await expect(terminalText).toBeVisible({ timeout: 8000 });
  });

  test('terminal-run with specific label uses that label', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    const input = page.locator('[role="combobox"]');
    await input.fill('in build-output: npm run build');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(2000);
    
    // Verify terminal surface has the specified label
    const terminalLabel = page.locator('text=build-output');
    await expect(terminalLabel).toBeVisible({ timeout: 5000 });
  });

  test('CommandBar closes on Escape key', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    const commandBar = page.locator('[role="dialog"]').filter({ hasText: /command bar/i });
    await expect(commandBar).toBeVisible();
    
    // Press Escape
    await page.keyboard.press('Escape');
    
    // Verify CommandBar closed
    await expect(commandBar).not.toBeVisible({ timeout: 1000 });
  });
});

test.describe('CommandBar E2E — Browser Intents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('browser-navigate intent spawns visible browser', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    const input = page.locator('[role="combobox"]');
    await input.fill('open https://github.com/');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(2000);
    
    // Verify browser surface spawned
    const browserSurface = page.locator('iframe[data-surface-type="browser"], webview, [data-url*="github.com"]');
    await expect(browserSurface.first()).toBeVisible({ timeout: 8000 });
  });

  test('browser-search intent spawns browser with search query', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    const input = page.locator('[role="combobox"]');
    await input.fill('search react hooks');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(2000);
    
    // Verify browser surface spawned with search URL
    const browserSurface = page.locator('iframe[data-surface-type="browser"], webview');
    await expect(browserSurface.first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('CommandBar E2E — Terminal Read Intent', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('terminal-read displays buffer content in CommandBar', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    
    // First, create a terminal with some content
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    const input = page.locator('[role="combobox"]');
    await input.fill('echo "Test output for read"');
    await page.keyboard.press('Enter');
    
    // Wait for terminal to execute
    await page.waitForTimeout(3000);
    
    // Open CommandBar again to read terminal
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    await input.fill('read terminal Terminal');
    await page.keyboard.press('Enter');
    
    // Verify terminal read result displays in CommandBar
    await page.waitForTimeout(1500);
    
    // Look for terminal name and output text
    const terminalName = page.locator('text=/Terminal/i').first();
    await expect(terminalName).toBeVisible({ timeout: 3000 });
    
    const outputText = page.locator('text=/Test output for read/i');
    await expect(outputText).toBeVisible({ timeout: 3000 });
  });

  test('terminal-read shows empty state for empty buffer', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    
    // Create a fresh terminal
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    const input = page.locator('[role="combobox"]');
    await input.fill('in empty-test: clear');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(2000);
    
    // Read the empty terminal
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    await input.fill('read terminal empty-test');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(1500);
    
    // Verify empty state message
    const emptyMessage = page.locator('text=/buffer is empty/i');
    await expect(emptyMessage).toBeVisible({ timeout: 3000 });
  });
});

test.describe('CommandBar E2E — Feature Flag', () => {
  test('CommandBar does not open when feature flag is disabled', async ({ page, context }) => {
    // Set feature flag to disabled (this would require environment variable or config change)
    // For now, this test documents the expected behavior
    // Actual implementation depends on how NEXT_PUBLIC_COMMANDBAR_ENABLED is configured
    test.skip('Requires environment-level feature flag toggling');
  });
});

test.describe('CommandBar E2E — Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('input has role="combobox" and aria-expanded', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    const input = page.locator('[role="combobox"]');
    await expect(input).toBeVisible();
    
    // Verify ARIA attributes
    await expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  test('status updates have aria-live="polite"', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    const input = page.locator('[role="combobox"]');
    await input.fill('echo test');
    await page.keyboard.press('Enter');
    
    // Wait for status region to appear
    await page.waitForTimeout(500);
    
    const statusRegion = page.locator('[role="status"]');
    await expect(statusRegion).toBeVisible({ timeout: 3000 });
    await expect(statusRegion).toHaveAttribute('aria-live', 'polite');
  });

  test('input is disabled during execution', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    
    await page.keyboard.press(isMac ? 'Meta+Shift+KeyK' : 'Control+Shift+KeyK');
    
    const input = page.locator('[role="combobox"]');
    await input.fill('sleep 2 && echo done');
    await page.keyboard.press('Enter');
    
    // Wait for execution to start
    await page.waitForTimeout(500);
    
    // Verify input is disabled during execution
    await expect(input).toBeDisabled();
  });
});
