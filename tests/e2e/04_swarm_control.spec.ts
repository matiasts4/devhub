import { test, expect } from '@playwright/test';

/**
 * QA-03 — Test Suite: SwarmControl
 * Verifica que la interfaz SwarmControl carga sin crash y los endpoints responden.
 */

test.describe('SwarmControl Page', () => {
  test('la página de SwarmControl carga sin errores 500', async ({ page }) => {
    const serverErrors: string[] = [];
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Buscar link de SwarmControl
    const swarmLink = page.locator(
      'a:has-text("Swarm"), a:has-text("Control"), a[href*="swarm"], [data-testid="nav-swarm"]'
    );
    
    if (await swarmLink.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await swarmLink.first().click();
      await page.waitForLoadState('networkidle');
    }

    expect(serverErrors).toHaveLength(0);
    await expect(page).not.toHaveTitle(/Error|500|404/);
  });

  test('el endpoint /api/agent/status responde sin error fatal', async ({ request }) => {
    const response = await request.get('/api/agent/status').catch(() => null);
    if (response) {
      // Aceptamos 200 o 404 (no implementado aún), pero no 500
      expect(response.status()).not.toBe(500);
    }
  });

  test('el endpoint /api/agent/branches responde sin error fatal', async ({ request }) => {
    const response = await request.get('/api/agent/branches').catch(() => null);
    if (response) {
      expect(response.status()).not.toBe(500);
    }
  });

  test('no hay errores de JavaScript fatales en SwarmControl', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const swarmLink = page.locator('a:has-text("Swarm"), a[href*="swarm"]');
    if (await swarmLink.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await swarmLink.first().click();
      await page.waitForTimeout(2000);
    }

    // Filtrar errores de recursos externos, solo los fatales del código propio
    const fatalErrors = jsErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('analytics') && !e.includes('__NEXT')
    );
    
    expect(fatalErrors).toHaveLength(0);
  });
});

test.describe('Smoke Tests — Rutas principales sin crash', () => {
  const routes = ['/', '/hub'];

  for (const route of routes) {
    test(`ruta ${route} carga sin errores 5xx`, async ({ page }) => {
      const serverErrors: string[] = [];
      page.on('response', (res) => {
        if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
      });

      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      expect(serverErrors).toHaveLength(0);
    });
  }
});
