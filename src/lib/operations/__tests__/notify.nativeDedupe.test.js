/**
 * dispatchOperationalNotification — single-channel dedupe (NATIVE-ONLY-01).
 *
 * When the native desktop notification is delivered (Electron → Windows),
 * the window event must carry desktop_status so the toast stack can skip
 * the duplicate in-app aviso. The event fires exactly once, AFTER the
 * native attempt resolves.
 *
 * @jest-environment jsdom
 */

/* eslint-env jest */

import { dispatchOperationalNotification } from '../notify';
import { EVENT_NAME } from '../events';

describe('dispatchOperationalNotification — native/toast dedupe', () => {
  let received;
  let listener;

  beforeEach(() => {
    window.localStorage.clear();
    received = [];
    listener = (event) => received.push(event.detail);
    window.addEventListener(EVENT_NAME, listener);
  });

  afterEach(() => {
    window.removeEventListener(EVENT_NAME, listener);
  });

  test('dispatches ONE event with desktop_status=delivered after native send', async () => {
    const order = [];
    const sendNotification = jest.fn().mockImplementation(async () => {
      order.push('native');
    });
    window.addEventListener(
      EVENT_NAME,
      () => {
        order.push('event');
      },
      { once: true }
    );

    const result = await dispatchOperationalNotification(
      {
        title: 'Kimi Code completó su respuesta',
        body: 'listo',
        category: 'agents',
        severity: 'info',
        dedupe_key: 'agent:done:p1',
        delivery: { desktop: true, in_app: true },
      },
      {
        isDesktopAvailable: async () => true,
        requestPermission: async () => 'granted',
        sendNotification,
      }
    );

    expect(result.desktop.status).toBe('delivered');
    expect(received).toHaveLength(1);
    expect(received[0].desktop_status).toBe('delivered');
    expect(received[0].title).toBe('Kimi Code completó su respuesta');
    // The event fires after the native notification, never before.
    expect(order).toEqual(['native', 'event']);
  });

  test('dispatches desktop_status=unavailable when there is no native bridge', async () => {
    await dispatchOperationalNotification(
      {
        title: 'Solo toast',
        category: 'agents',
        severity: 'info',
        dedupe_key: 'agent:done:p2',
        delivery: { desktop: true, in_app: true },
      },
      {
        isDesktopAvailable: async () => false,
        requestPermission: async () => 'granted',
        sendNotification: jest.fn(),
      }
    );

    expect(received).toHaveLength(1);
    expect(received[0].desktop_status).toBe('unavailable');
  });

  test('desktop delivery disabled → desktop_status=skipped, event still fires', async () => {
    await dispatchOperationalNotification(
      {
        title: 'In-app only',
        category: 'system',
        severity: 'info',
        dedupe_key: 'sys:1',
        delivery: { desktop: false, in_app: true },
      },
      {
        isDesktopAvailable: async () => true,
        requestPermission: async () => 'granted',
        sendNotification: jest.fn(),
      }
    );

    expect(received).toHaveLength(1);
    expect(received[0].desktop_status).toBe('skipped');
  });
});
