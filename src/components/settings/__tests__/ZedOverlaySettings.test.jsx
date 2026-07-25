/**
 * @jest-environment jsdom
 */

import ZedOverlaySettings from '../ZedOverlaySettings';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ZED_OVERLAY_SETTINGS_KEY,
  ZED_OVERLAY_SETTINGS_EVENT,
} from '@/lib/asistente/zedOverlaySettings';

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

describe('ZedOverlaySettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('renders the aura/drawer controls with default values', () => {
    render(<ZedOverlaySettings />);
    expect(screen.getByTestId('zed-aura-enabled-toggle').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('zed-aura-intensity-select').value).toBe('normal');
    expect(screen.getByTestId('zed-aura-speed-select').value).toBe('normal');
    expect(screen.getByTestId('zed-drawer-width-select').value).toBe('normal');
  });

  test('toggling the aura off persists to localStorage and dispatches the change event', () => {
    const handler = jest.fn();
    window.addEventListener(ZED_OVERLAY_SETTINGS_EVENT, handler);
    render(<ZedOverlaySettings />);

    fireEvent.click(screen.getByTestId('zed-aura-enabled-toggle'));

    expect(screen.getByTestId('zed-aura-enabled-toggle').getAttribute('aria-checked')).toBe(
      'false'
    );
    expect(JSON.parse(window.localStorage.getItem(ZED_OVERLAY_SETTINGS_KEY))).toMatchObject({
      auraEnabled: false,
    });
    expect(handler).toHaveBeenCalled();
    window.removeEventListener(ZED_OVERLAY_SETTINGS_EVENT, handler);
  });

  test('changing intensity, speed, and drawer width updates persisted settings', () => {
    render(<ZedOverlaySettings />);

    fireEvent.change(screen.getByTestId('zed-aura-intensity-select'), {
      target: { value: 'intense' },
    });
    fireEvent.change(screen.getByTestId('zed-aura-speed-select'), {
      target: { value: 'fast' },
    });
    fireEvent.change(screen.getByTestId('zed-drawer-width-select'), {
      target: { value: 'wide' },
    });

    expect(JSON.parse(window.localStorage.getItem(ZED_OVERLAY_SETTINGS_KEY))).toEqual({
      auraEnabled: true,
      auraIntensity: 'intense',
      auraSpeed: 'fast',
      drawerWidth: 'wide',
    });
  });

  test('disables the intensity/speed selects when the aura is off', () => {
    render(<ZedOverlaySettings />);
    fireEvent.click(screen.getByTestId('zed-aura-enabled-toggle'));
    expect(screen.getByTestId('zed-aura-intensity-select').disabled).toBe(true);
    expect(screen.getByTestId('zed-aura-speed-select').disabled).toBe(true);
    expect(screen.getByTestId('zed-drawer-width-select').disabled).toBe(false);
  });
});
