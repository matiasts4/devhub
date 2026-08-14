/**
 * NotificationToastStack — NATIVE-ONLY-01: when the native Windows
 * notification was already delivered (desktop_status=delivered from
 * notify.js), the in-app toast and DevHub sound are suppressed so the
 * user gets exactly one aviso.
 */

const React = require('react');
const {
  cleanupMountedRoots,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');
const { EVENT_NAME } = require('@/lib/operations/events');

jest.mock('@/lib/notifications/soundEffects', () => ({
  playNotificationSound: jest.fn(),
}));

jest.mock('@/lib/desktop/desktopRuntime', () => ({
  isDesktopHost: () => true,
}));

const { playNotificationSound } = require('@/lib/notifications/soundEffects');
const NotificationToastStack = require('../NotificationToastStack').default;

describe('NotificationToastStack — native dedupe', () => {
  const mountedRoots = [];

  beforeEach(() => {
    jest.clearAllMocks();
    installDom();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
  });

  async function emit(detail) {
    window.dispatchEvent(new window.CustomEvent(EVENT_NAME, { detail }));
    await flushEffects();
  }

  test('suppresses toast and sound when native notification was delivered', async () => {
    const { container } = await renderIntoDom(
      React.createElement(NotificationToastStack),
      mountedRoots
    );

    await emit({
      id: 'n1',
      title: 'Kimi Code completó su respuesta',
      message: 'listo',
      severity: 'info',
      desktop_status: 'delivered',
    });

    expect(container.textContent).not.toContain('Kimi Code completó su respuesta');
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  test('shows toast when native delivery was unavailable (web fallback)', async () => {
    const { container } = await renderIntoDom(
      React.createElement(NotificationToastStack),
      mountedRoots
    );

    await emit({
      id: 'n2',
      title: 'Solo toast',
      message: 'sin bridge nativo',
      severity: 'info',
      desktop_status: 'unavailable',
    });

    expect(container.textContent).toContain('Solo toast');
  });

  test('shows toast for legacy events without desktop_status', async () => {
    const { container } = await renderIntoDom(
      React.createElement(NotificationToastStack),
      mountedRoots
    );

    await emit({
      id: 'n3',
      title: 'Evento legacy',
      message: 'sin campo desktop_status',
      severity: 'warning',
    });

    expect(container.textContent).toContain('Evento legacy');
  });
});
