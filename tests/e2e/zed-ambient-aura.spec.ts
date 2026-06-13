/**
 * E2E smoke checklist for the Zed ambient aura (ZAA-7).
 *
 * This file is intentionally marked as `test.skip` everywhere — the
 * scenarios are the manual acceptance checklist from
 * `openspec/changes/zed-ambient-aura/tasks.md` (Phase 5, ZAA-7). They
 * serve as living documentation for the manual smoke gate that the
 * spec says "DO NOT block PR on it".
 *
 * If a future change wants to wire any of these as automated, the
 * recipe is:
 *   1. Drive the Zustand/local store (or `addInitScript` to set
 *      `useZedChat.lastToolType`) so the overlay renders the desired
 *      phase.
 *   2. Read `.zed-aura-root` attribute `data-tool` and class list.
 *   3. For reduced-motion, emulate via Playwright's
 *      `emulateMedia({ reducedMotion: 'reduce' })`.
 *
 * Unit coverage for the same contract already lives in:
 *   - `src/lib/asistente/__tests__/zedAuraBudget.test.js`
 *   - `src/lib/asistente/__tests__/buildZedAmbientStatus.test.js`
 *   - `src/lib/asistente/__tests__/useZedChat.test.js`
 *   - `src/lib/asistente/__tests__/zedOverlayEvents.test.js`
 *   - `src/components/asistente/__tests__/ZedAmbientOverlay.toolType.test.jsx`
 *   - `src/app/globals.css.__tests__/zedAuraCss.test.js`
 *
 * [ ] Open Zed pill in any project. Aura opacity at `open` phase ≤ 0.18.
 * [ ] Ask Zed to "abrí una terminal con ls". Aura shifts to teal,
 *     opacity ≤ 0.35, no aggressive pulse on reduced-motion.
 * [ ] Open browser via Zed ("abrí GitHub"). Aura shifts toward violet.
 * [ ] Toggle OS reduced-motion → no animation, static tint only.
 * [ ] Click terminal surface while aura visible at `executing`: click
 *     reaches terminal (no `pointerdown` consumed by aura).
 * [ ] Open a shadcn dialog over the aura → dialog renders above.
 */

import { test, expect } from '@playwright/test';

test.describe('Zed ambient aura (ZAA-7) — manual smoke stubs', () => {
  test.skip('open phase aura opacity is ≤ 0.18 (visual)', async () => {
    // Drive a project that has the Zed pill available, then read the
    // computed opacity of `[data-testid="zed-ambient-aura"]`.
    // Manual checklist bullet 1.
  });

  test.skip('executing terminal tool shifts aura toward teal, ≤ 0.35', async () => {
    // Force useZedChat.lastToolType === 'terminal' via addInitScript
    // and verify the .zed-aura-root element exposes --accent-terminal
    // and data-tool="terminal". Manual checklist bullet 2.
  });

  test.skip('open_url tool shifts aura toward violet (--accent-browser)', async () => {
    // Same recipe with lastToolType === 'browser'. Manual bullet 3.
  });

  test.skip('reduced-motion media query suppresses per-tool pulse', async () => {
    // Use page.emulateMedia({ reducedMotion: 'reduce' }) and assert
    // no `.zed-aura-pulse-*` class is present on the inner gradient.
    // Manual bullet 4.
  });
});
