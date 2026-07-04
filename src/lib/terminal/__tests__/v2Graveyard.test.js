/**
 * @jest-environment jsdom
 */

/**
 * v2Graveyard.test.js — TDD unit tests for the v2 hidden surface registry.
 */

import {
  V2_GRAVEYARD_LRU_CAP,
  disposeAllSurfaces,
  disposeSurface,
  evictOldestIfNeeded,
  hasSurface,
  listStashed,
  resetHiddenHostForTests,
  restoreSurface,
  stashSurface,
} from '../v2Graveyard.js';

function createMockSurface(sessionId = 'mock-session') {
  const container = document.createElement('div');
  container.setAttribute('data-testid', `graveyard-container-${sessionId}`);

  const termInstance = {
    dispose: jest.fn(),
    element: container,
  };
  const webglAddon = { dispose: jest.fn() };
  const canvasAddon = { dispose: jest.fn() };
  const serializeAddon = { dispose: jest.fn() };

  return {
    termInstance,
    webglAddon,
    canvasAddon,
    serializeAddon,
    container,
    metadata: { cols: 80, rows: 24 },
  };
}

beforeEach(() => {
  disposeAllSurfaces();
  resetHiddenHostForTests();
});

describe('v2Graveyard', () => {
  it('stashes a surface and reports it as present', () => {
    const surface = createMockSurface('s1');

    expect(hasSurface('s1')).toBe(false);
    expect(stashSurface('s1', surface)).toBe(true);
    expect(hasSurface('s1')).toBe(true);
    expect(listStashed()).toContain('s1');
  });

  it('restore returns the same surface and removes it from the registry', () => {
    const surface = createMockSurface('s2');
    stashSurface('s2', surface);

    const restored = restoreSurface('s2');

    expect(restored.termInstance).toBe(surface.termInstance);
    expect(restored.webglAddon).toBe(surface.webglAddon);
    expect(hasSurface('s2')).toBe(false);
    expect(listStashed()).not.toContain('s2');
  });

  it('restore after dispose returns null', () => {
    const surface = createMockSurface('s3');
    stashSurface('s3', surface);
    disposeSurface('s3');

    expect(restoreSurface('s3')).toBeNull();
    expect(hasSurface('s3')).toBe(false);
  });

  it('dispose removes the surface and calls addon/term dispose', () => {
    const surface = createMockSurface('s4');
    stashSurface('s4', surface);

    expect(disposeSurface('s4')).toBe(true);

    expect(surface.webglAddon.dispose).toHaveBeenCalled();
    expect(surface.canvasAddon.dispose).toHaveBeenCalled();
    expect(surface.serializeAddon.dispose).toHaveBeenCalled();
    expect(surface.termInstance.dispose).toHaveBeenCalled();
    expect(hasSurface('s4')).toBe(false);
  });

  it('stashing a new surface for the same session id evicts the old one', () => {
    const first = createMockSurface('s5');
    const second = createMockSurface('s5');

    stashSurface('s5', first);
    stashSurface('s5', second);

    const restored = restoreSurface('s5');
    expect(restored.termInstance).toBe(second.termInstance);
    expect(first.termInstance.dispose).toHaveBeenCalled();
    expect(second.termInstance.dispose).not.toHaveBeenCalled();
  });

  it('moves the container to a hidden host element', () => {
    const surface = createMockSurface('s6');
    const originalParent = document.createElement('div');
    originalParent.appendChild(surface.container);
    document.body.appendChild(originalParent);

    stashSurface('s6', surface);

    expect(surface.container.parentElement).not.toBe(originalParent);
    expect(surface.container.parentElement.getAttribute('aria-hidden')).toBe('true');
  });

  it('returns false for invalid stash calls', () => {
    expect(stashSurface('', createMockSurface())).toBe(false);
    expect(stashSurface('missing-term', { metadata: {} })).toBe(false);
  });

  it('restore/dispose return null/false for unknown sessions', () => {
    expect(restoreSurface('unknown')).toBeNull();
    expect(disposeSurface('unknown')).toBe(false);
  });

  it('exports the Phase 5 LRU cap constant', () => {
    expect(V2_GRAVEYARD_LRU_CAP).toBe(12);
  });

  it('evicts the oldest stashed surface when exceeding the LRU cap', () => {
    const surfaces = [];
    for (let i = 0; i < V2_GRAVEYARD_LRU_CAP + 1; i += 1) {
      const surface = createMockSurface(`lru-${i}`);
      surfaces.push(surface);
      stashSurface(`lru-${i}`, surface);
    }

    expect(listStashed()).toHaveLength(V2_GRAVEYARD_LRU_CAP);
    expect(hasSurface('lru-0')).toBe(false);
    expect(hasSurface(`lru-${V2_GRAVEYARD_LRU_CAP}`)).toBe(true);
    expect(surfaces[0].termInstance.dispose).toHaveBeenCalled();
    expect(surfaces[V2_GRAVEYARD_LRU_CAP].termInstance.dispose).not.toHaveBeenCalled();
  });

  it('evictOldestIfNeeded is a no-op when the registry is within the cap', () => {
    for (let i = 0; i < V2_GRAVEYARD_LRU_CAP; i += 1) {
      stashSurface(`in-cap-${i}`, createMockSurface(`in-cap-${i}`));
    }

    expect(evictOldestIfNeeded()).toEqual([]);
    expect(listStashed()).toHaveLength(V2_GRAVEYARD_LRU_CAP);
  });
});
