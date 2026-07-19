/**
 * @jest-environment node
 */

const {
  shouldHideBrowsersForOverlay,
  mergeAvoidRects,
  buildHideAllPayload,
  buildWorkspaceVisibilityPayload,
} = require('../browserOverlays');

describe('browserOverlays', () => {
  describe('shouldHideBrowsersForOverlay', () => {
    test('false when nothing open', () => {
      expect(shouldHideBrowsersForOverlay({})).toBe(false);
      expect(shouldHideBrowsersForOverlay({ modalOpen: false, commandPaletteOpen: false })).toBe(
        false
      );
    });

    test('true when modal or command palette open', () => {
      expect(shouldHideBrowsersForOverlay({ modalOpen: true })).toBe(true);
      expect(shouldHideBrowsersForOverlay({ commandPaletteOpen: true })).toBe(true);
      expect(shouldHideBrowsersForOverlay({ modalOpen: true, commandPaletteOpen: true })).toBe(
        true
      );
    });
  });

  describe('mergeAvoidRects', () => {
    test('returns empty for non-arrays', () => {
      expect(mergeAvoidRects(null)).toEqual([]);
      expect(mergeAvoidRects(undefined)).toEqual([]);
      expect(mergeAvoidRects({})).toEqual([]);
    });

    test('drops zero-area and invalid rects', () => {
      expect(
        mergeAvoidRects([
          { x: 0, y: 0, width: 0, height: 10 },
          { x: 1, y: 2, width: 3, height: 4 },
          null,
          { x: 'a', y: 0, width: 5, height: 5 },
        ])
      ).toEqual([
        { x: 1, y: 2, width: 3, height: 4 },
        { x: 0, y: 0, width: 5, height: 5 },
      ]);
    });

    test('dedupes exact duplicates and keeps source', () => {
      const rects = mergeAvoidRects([
        { x: 10, y: 20, width: 30, height: 40, source: 'modal' },
        { x: 10, y: 20, width: 30, height: 40, source: 'modal' },
        { x: 10, y: 20, width: 30, height: 40, source: 'palette' },
      ]);
      expect(rects).toEqual([
        { x: 10, y: 20, width: 30, height: 40, source: 'modal' },
        { x: 10, y: 20, width: 30, height: 40, source: 'palette' },
      ]);
    });
  });

  describe('buildHideAllPayload', () => {
    test('defaults reason to overlay', () => {
      expect(buildHideAllPayload()).toEqual({ reason: 'overlay' });
    });

    test('passes custom reason', () => {
      expect(buildHideAllPayload({ reason: 'command-palette' })).toEqual({
        reason: 'command-palette',
      });
    });
  });

  describe('buildWorkspaceVisibilityPayload', () => {
    test('nulls empty workspace id', () => {
      expect(buildWorkspaceVisibilityPayload(null)).toEqual({ workspaceId: null });
      expect(buildWorkspaceVisibilityPayload(undefined)).toEqual({ workspaceId: null });
      expect(buildWorkspaceVisibilityPayload('')).toEqual({ workspaceId: null });
    });

    test('stringifies workspace id', () => {
      expect(buildWorkspaceVisibilityPayload('ws-1')).toEqual({ workspaceId: 'ws-1' });
      expect(buildWorkspaceVisibilityPayload(42)).toEqual({ workspaceId: '42' });
    });
  });
});
