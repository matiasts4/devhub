const { JSDOM } = require('jsdom');

const {
  ZED_OVERLAY_SETTINGS_KEY,
  ZED_OVERLAY_SETTINGS_EVENT,
  ZED_AURA_INTENSITY_SCALE,
  ZED_AURA_SPEED_SCALE,
  ZED_DRAWER_WIDTH_PX,
  readZedOverlaySettings,
  writeZedOverlaySettings,
} = require('../zedOverlaySettings');

describe('zedOverlaySettings', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://devhub.test' });
    global.window = dom.window;
    global.document = dom.window.document;
    global.CustomEvent = dom.window.CustomEvent;
    window.localStorage.clear();
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.CustomEvent;
  });

  test('returns defaults when nothing is stored', () => {
    expect(readZedOverlaySettings()).toEqual({
      auraEnabled: true,
      auraIntensity: 'normal',
      auraSpeed: 'normal',
      drawerWidth: 'normal',
    });
  });

  test('round-trips a valid write through localStorage', () => {
    writeZedOverlaySettings({
      auraEnabled: false,
      auraIntensity: 'intense',
      auraSpeed: 'fast',
      drawerWidth: 'wide',
    });
    expect(readZedOverlaySettings()).toEqual({
      auraEnabled: false,
      auraIntensity: 'intense',
      auraSpeed: 'fast',
      drawerWidth: 'wide',
    });
    expect(JSON.parse(window.localStorage.getItem(ZED_OVERLAY_SETTINGS_KEY))).toEqual({
      auraEnabled: false,
      auraIntensity: 'intense',
      auraSpeed: 'fast',
      drawerWidth: 'wide',
    });
  });

  test('normalizes unknown enum values back to defaults', () => {
    window.localStorage.setItem(
      ZED_OVERLAY_SETTINGS_KEY,
      JSON.stringify({ auraIntensity: 'ultra', auraSpeed: 'warp', drawerWidth: 'huge' })
    );
    expect(readZedOverlaySettings()).toEqual({
      auraEnabled: true,
      auraIntensity: 'normal',
      auraSpeed: 'normal',
      drawerWidth: 'normal',
    });
  });

  test('survives corrupt JSON in localStorage', () => {
    window.localStorage.setItem(ZED_OVERLAY_SETTINGS_KEY, '{not-json');
    expect(readZedOverlaySettings()).toEqual({
      auraEnabled: true,
      auraIntensity: 'normal',
      auraSpeed: 'normal',
      drawerWidth: 'normal',
    });
  });

  test('dispatches ZED_OVERLAY_SETTINGS_EVENT with the normalized payload on write', () => {
    const handler = jest.fn();
    window.addEventListener(ZED_OVERLAY_SETTINGS_EVENT, handler);
    writeZedOverlaySettings({ auraIntensity: 'subtle' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toMatchObject({ auraIntensity: 'subtle' });
  });

  test('exposes intensity/speed/width lookup tables used by the overlay', () => {
    expect(ZED_AURA_INTENSITY_SCALE).toEqual({ subtle: 0.6, normal: 1, intense: 1.5 });
    expect(ZED_AURA_SPEED_SCALE).toEqual({ slow: 1.6, normal: 1, fast: 0.6 });
    expect(ZED_DRAWER_WIDTH_PX).toEqual({ compact: 320, normal: 400, wide: 480 });
  });
});
