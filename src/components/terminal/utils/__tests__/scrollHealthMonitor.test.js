const { installDom } = require('@/test-support/domHarness');
import { createScrollHealthMonitor } from '../scrollHealthMonitor';

beforeAll(() => {
  installDom();
  if (typeof globalThis.WheelEvent === 'undefined') {
    class MockWheelEvent extends globalThis.Event {
      constructor(type, eventInitDict = {}) {
        super(type, { bubbles: true, cancelable: true, ...eventInitDict });
        this.deltaY = eventInitDict.deltaY ?? 0;
        this.deltaX = eventInitDict.deltaX ?? 0;
        this.clientX = eventInitDict.clientX ?? 0;
        this.clientY = eventInitDict.clientY ?? 0;
      }
    }
    globalThis.WheelEvent = MockWheelEvent;
    if (globalThis.window) {
      globalThis.window.WheelEvent = MockWheelEvent;
    }
  }
});

describe('scrollHealthMonitor', () => {
  let fakeContainer;
  let fakeTerm;
  let mockLogger;
  let currentTime;

  const fakeNow = () => currentTime;

  beforeEach(() => {
    jest.useFakeTimers();
    currentTime = 1000;

    fakeContainer = document.createElement('div');
    fakeContainer.id = 'terminal-container';
    document.body.appendChild(fakeContainer);

    fakeTerm = {
      buffer: {
        active: {
          type: 'normal',
          viewportY: 10,
          baseY: 100,
        },
      },
      _core: {
        coreService: {
          decPrivateModes: {
            mouseTrackingMode: 1,
          },
        },
      },
    };

    mockLogger = jest.fn();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    if (fakeContainer && fakeContainer.parentNode) {
      fakeContainer.parentNode.removeChild(fakeContainer);
    }
  });

  function dispatchWheel(target = fakeContainer, options = {}) {
    const event = new globalThis.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: options.clientX ?? 50,
      clientY: options.clientY ?? 50,
      deltaY: options.deltaY ?? 100,
      ...options,
    });
    target.dispatchEvent(event);
    return event;
  }

  test('1. Wheel con scrollback que se mueve → sano, contador en 0', () => {
    const monitor = createScrollHealthMonitor('panel-1', {
      getTerm: () => fakeTerm,
      logger: mockLogger,
      now: fakeNow,
    });
    monitor.attach(fakeContainer);

    // Initial viewportY is 10
    dispatchWheel(fakeContainer, { deltaY: 100 });

    // Move scrollback before timer fires
    fakeTerm.buffer.active.viewportY = 13;

    jest.advanceTimersByTime(300);

    expect(monitor.getStatus()).toBe('healthy');
    expect(monitor.getDeadCount()).toBe(0);
    expect(mockLogger).not.toHaveBeenCalledWith('scroll-dead-event', expect.anything());
    expect(mockLogger).not.toHaveBeenCalledWith('scroll-broken', expect.anything());

    monitor.dispose();
  });

  test('2. Wheel con write PTY (SGR) → sano', () => {
    const monitor = createScrollHealthMonitor('panel-1', {
      getTerm: () => fakeTerm,
      logger: mockLogger,
      now: fakeNow,
    });
    monitor.attach(fakeContainer);

    dispatchWheel(fakeContainer, { deltaY: 100 });

    // PTY write occurs
    monitor.onPtyWheelWrite({ type: 'sgr-paste' });

    jest.advanceTimersByTime(300);

    expect(monitor.getStatus()).toBe('healthy');
    expect(monitor.getDeadCount()).toBe(0);
    expect(mockLogger).not.toHaveBeenCalledWith('scroll-dead-event', expect.anything());

    monitor.dispose();
  });

  test('3. Wheel procesado por handler → sano', () => {
    const monitor = createScrollHealthMonitor('panel-1', {
      getTerm: () => fakeTerm,
      logger: mockLogger,
      now: fakeNow,
    });
    monitor.attach(fakeContainer);

    dispatchWheel(fakeContainer, { deltaY: 100 });

    // Handler processing occurs
    monitor.onWheelHandlerProcessed({ path: 'inject-wheel' });

    jest.advanceTimersByTime(300);

    expect(monitor.getStatus()).toBe('healthy');
    expect(monitor.getDeadCount()).toBe(0);
    expect(mockLogger).not.toHaveBeenCalledWith('scroll-dead-event', expect.anything());

    monitor.dispose();
  });

  test('4. Wheel sin ningún efecto ×3 → scroll-broken; wheel sano posterior → scroll-recovered', () => {
    const monitor = createScrollHealthMonitor('panel-1', {
      getTerm: () => fakeTerm,
      logger: mockLogger,
      now: fakeNow,
    });
    monitor.attach(fakeContainer);

    // Event 1 (dead)
    dispatchWheel(fakeContainer, { deltaY: 100 });
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(1);
    expect(monitor.getStatus()).toBe('healthy');
    expect(mockLogger).toHaveBeenCalledWith('scroll-dead-event', expect.anything());

    // Event 2 (dead)
    dispatchWheel(fakeContainer, { deltaY: 100 });
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(2);
    expect(monitor.getStatus()).toBe('healthy');

    // Event 3 (dead -> enters broken)
    dispatchWheel(fakeContainer, { deltaY: 100 });
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(3);
    expect(monitor.getStatus()).toBe('broken');
    expect(mockLogger).toHaveBeenCalledWith(
      'scroll-broken',
      expect.objectContaining({
        panelId: 'panel-1',
        extra: expect.objectContaining({
          status: 'broken',
          deadCount: 3,
        }),
      })
    );

    // Event 4 (healthy -> recovers)
    dispatchWheel(fakeContainer, { deltaY: 100 });
    monitor.onWheelHandlerProcessed({ path: 'inject-wheel' });
    jest.advanceTimersByTime(300);

    expect(monitor.getDeadCount()).toBe(0);
    expect(monitor.getStatus()).toBe('healthy');
    expect(mockLogger).toHaveBeenCalledWith(
      'scroll-recovered',
      expect.objectContaining({
        panelId: 'panel-1',
        extra: expect.objectContaining({
          status: 'healthy',
        }),
      })
    );

    monitor.dispose();
  });

  test('5. Excepciones: wheel arriba con viewportY=0 no cuenta; wheel en panel inactivo no cuenta; interceptor visible legítimo no cuenta', () => {
    let isActive = true;
    const monitor = createScrollHealthMonitor('panel-1', {
      getTerm: () => fakeTerm,
      getIsActivePanel: () => isActive,
      logger: mockLogger,
      now: fakeNow,
    });
    monitor.attach(fakeContainer);

    // Exception A: Wheel UP with viewportY === 0
    fakeTerm.buffer.active.viewportY = 0;
    dispatchWheel(fakeContainer, { deltaY: -100 });
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(0);

    // Exception B: Inactive panel
    fakeTerm.buffer.active.viewportY = 10;
    isActive = false;
    dispatchWheel(fakeContainer, { deltaY: 100 });
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(0);

    // Exception C: Visible legitimate interceptor outside terminal container
    isActive = true;
    const modalEl = document.createElement('div');
    modalEl.id = 'zed-assistant-modal';
    Object.defineProperty(modalEl, 'offsetWidth', { value: 400 });
    Object.defineProperty(modalEl, 'offsetHeight', { value: 300 });
    document.body.appendChild(modalEl);

    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = jest.fn().mockReturnValue(modalEl);

    dispatchWheel(fakeContainer, { deltaY: 100, clientX: 200, clientY: 200 });
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(0);

    document.elementFromPoint = origElementFromPoint;
    document.body.removeChild(modalEl);
    monitor.dispose();
  });

  test('6. Overlay que se traga el evento (dispatch directo sobre otro elemento del contenedor en capture) → el monitor LO VE igualmente y lo cuenta si no hay efecto', () => {
    const monitor = createScrollHealthMonitor('panel-1', {
      getTerm: () => fakeTerm,
      logger: mockLogger,
      now: fakeNow,
    });
    monitor.attach(fakeContainer);

    // Inner element inside container (e.g. invisible overlay or component) that stops propagation
    const innerChild = document.createElement('div');
    fakeContainer.appendChild(innerChild);
    innerChild.addEventListener('wheel', (e) => {
      e.stopPropagation(); // Swallows the wheel in target/bubble phase
    });

    // Dispatch directly on innerChild
    dispatchWheel(innerChild, { deltaY: 100 });

    // Monitor attached on capture phase receives it! No effect produced -> counts as dead event
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(1);
    expect(mockLogger).toHaveBeenCalledWith('scroll-dead-event', expect.anything());

    monitor.dispose();
  });

  test('7. Reset del contador con wheel sano entre fallos', () => {
    const monitor = createScrollHealthMonitor('panel-1', {
      getTerm: () => fakeTerm,
      logger: mockLogger,
      now: fakeNow,
    });
    monitor.attach(fakeContainer);

    // Dead event 1
    dispatchWheel(fakeContainer, { deltaY: 100 });
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(1);

    // Dead event 2
    dispatchWheel(fakeContainer, { deltaY: 100 });
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(2);

    // Healthy event -> resets count to 0
    dispatchWheel(fakeContainer, { deltaY: 100 });
    monitor.onWheelHandlerProcessed({ path: 'inject-wheel' });
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(0);
    expect(monitor.getStatus()).toBe('healthy');

    // Dead event 1 after reset
    dispatchWheel(fakeContainer, { deltaY: 100 });
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(1);

    monitor.dispose();
  });

  test('8. dispose() deja de contar y limpia timers', () => {
    const monitor = createScrollHealthMonitor('panel-1', {
      getTerm: () => fakeTerm,
      logger: mockLogger,
      now: fakeNow,
    });
    monitor.attach(fakeContainer);

    dispatchWheel(fakeContainer, { deltaY: 100 });

    // Dispose before timer fires
    monitor.dispose();

    jest.advanceTimersByTime(300);

    expect(monitor.getDeadCount()).toBe(0);
    expect(mockLogger).not.toHaveBeenCalled();

    // Wheel after dispose is ignored
    dispatchWheel(fakeContainer, { deltaY: 100 });
    jest.advanceTimersByTime(300);
    expect(monitor.getDeadCount()).toBe(0);
  });
});
