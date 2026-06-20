/**
 * @jest-environment jsdom
 */

const React = require('react');
const { renderHook, act } = require('@testing-library/react');
const { useZedOverlay } = require('@/lib/asistente/useZedOverlay');
const {
  dispatchZedOverlayToggle,
  dispatchZedOverlayOpen,
  dispatchZedOverlayClose,
} = require('@/lib/asistente/zedOverlayEvents');

describe('useZedOverlay', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useZedOverlay());
    expect(result.current.isOpen).toBe(false);
  });

  it('open and close work', () => {
    const { result } = renderHook(() => useZedOverlay());
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it('toggle flips state', () => {
    const { result } = renderHook(() => useZedOverlay());
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });

  it('responds to toggle event', () => {
    const { result } = renderHook(() => useZedOverlay());
    act(() => dispatchZedOverlayToggle());
    expect(result.current.isOpen).toBe(true);
  });

  it('responds to open and close events', () => {
    const { result } = renderHook(() => useZedOverlay());
    act(() => dispatchZedOverlayOpen());
    expect(result.current.isOpen).toBe(true);
    act(() => dispatchZedOverlayClose());
    expect(result.current.isOpen).toBe(false);
  });

  it('responds to keyboard shortcut', () => {
    const { result } = renderHook(() => useZedOverlay());
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        shiftKey: true,
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });
    expect(result.current.isOpen).toBe(true);
  });
});
