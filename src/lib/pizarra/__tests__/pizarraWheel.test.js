import {
  isPizarraInteractiveWheelTarget,
  PIZARRA_INTERACTIVE_WHEEL_SELECTOR,
  shouldCanvasConsumeWheel,
} from '../pizarraWheel';

describe('pizarraWheel', () => {
  test('selector includes canvas-terminal and xterm viewport', () => {
    expect(PIZARRA_INTERACTIVE_WHEEL_SELECTOR).toContain('canvas-terminal');
    expect(PIZARRA_INTERACTIVE_WHEEL_SELECTOR).toContain('terminal-viewport-shell');
    expect(PIZARRA_INTERACTIVE_WHEEL_SELECTOR).toContain('pizarra-browser-surface');
  });

  test('isPizarraInteractiveWheelTarget matches nested terminal content', () => {
    const viewport = {
      closest: (selector) => {
        if (selector.includes('canvas-terminal')) return { tagName: 'DIV' };
        return null;
      },
    };

    expect(isPizarraInteractiveWheelTarget(viewport)).toBe(true);
    expect(isPizarraInteractiveWheelTarget({ closest: () => null })).toBe(false);
  });

  test('shouldCanvasConsumeWheel returns false over terminal container bounds', () => {
    const el = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 100,
        right: 500,
        bottom: 400,
        width: 400,
        height: 300,
      }),
    };
    const querySelectorAll = jest.fn(() => [el]);
    const previousDocument = global.document;
    global.document = { querySelectorAll };

    const event = { target: {}, clientX: 200, clientY: 200, deltaY: 40 };
    expect(shouldCanvasConsumeWheel(event)).toBe(false);
    expect(shouldCanvasConsumeWheel({ ...event, clientX: 50, clientY: 50 })).toBe(true);

    global.document = previousDocument;
  });
});