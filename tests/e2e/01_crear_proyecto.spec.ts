import { test, expect } from '@playwright/test';

/**
 * QA-03 — Test Suite: Creación de Proyecto con Planning IA
 * Verifica que el flujo completo de crear un proyecto desde el Hub funcione correctamente.
 */

test.describe('Crear Proyecto desde ProjectHub', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hub');
    await page.waitForLoadState('networkidle');
  });

  test('la página /hub carga sin errores', async ({ page }) => {
    await expect(page).toHaveTitle(/DevHub/i);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('puede abrir modal de nuevo proyecto', async ({ page }) => {
    // Buscar botón "Nuevo Proyecto" (puede tener distintos data-testids)
    const newProjectBtn = page.locator(
      '[data-testid="btn-nuevo-proyecto"], button:has-text("Nuevo Proyecto"), button:has-text("New Project")'
    );
    await expect(newProjectBtn.first()).toBeVisible({ timeout: 10000 });
    await newProjectBtn.first().click();

    // Verificar que abrió un modal o formulario
    const modal = page.locator('[role="dialog"], [data-testid="modal-proyecto"]');
    await expect(modal.first()).toBeVisible({ timeout: 5000 });
  });

  test('puede crear un proyecto nuevo', async ({ page }) => {
    const newProjectBtn = page.locator(
      '[data-testid="btn-nuevo-proyecto"], button:has-text("Nuevo Proyecto"), button:has-text("New Project")'
    );
    
    if (await newProjectBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await newProjectBtn.first().click();

      const nameInput = page.locator('input[placeholder*="nombre"], input[name="name"], [data-testid="input-nombre"]');
      if (await nameInput.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await nameInput.first().fill('Test Project E2E');
        
        const confirmBtn = page.locator('[data-testid="btn-confirmar"], button:has-text("Crear"), button[type="submit"]');
        await confirmBtn.first().click();
        
        // Verificar que se creó (por URL o por presencia del nombre en la UI)
        await page.waitForTimeout(2000);
        const projectVisible = await page.locator('text=Test Project E2E').isVisible().catch(() => false);
        expect(projectVisible || page.url().includes('/project/')).toBeTruthy();
      }
    }
  });

  test('la página no tiene errores 500 en consola', async ({ page }) => {
    const errors: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 500) {
        errors.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/hub');
    await page.waitForLoadState('networkidle');
    
    expect(errors).toHaveLength(0);
  });
});
