'use strict';

/** Shared IPC channel names (main ↔ preload). */
const CHANNELS = {
  INVOKE: 'desktop:invoke',
  NATIVE_BROWSER_EVENT: 'desktop:native-browser:event',
  VOICE_EVENT: 'desktop:voice:event',
  WINDOW_EVENT: 'desktop:window:event',
};

/** Tauri-compatible native browser command names. */
const NATIVE_BROWSER_COMMANDS = {
  PROBE: 'native_browser_probe',
  OPEN: 'native_browser_open',
  LOAD: 'native_browser_load_url',
  RELOAD: 'native_browser_reload',
  RESIZE: 'native_browser_resize',
  FOCUS: 'native_browser_focus',
  RAISE: 'native_browser_raise',
  VISIBILITY: 'native_browser_set_visibility',
  SELECTOR: 'native_browser_selector_command',
  SELECT_ALL: 'native_browser_select_all',
  COPY: 'native_browser_copy',
  CLOSE: 'native_browser_close',
  GO_BACK: 'native_browser_go_back',
  GO_FORWARD: 'native_browser_go_forward',
  CAPTURE: 'native_browser_capture',
  /** Blur embed windows so SPA toolbar/URL can receive clicks/focus. */
  RELEASE_FOCUS: 'native_browser_release_focus',
  /** E2 bulk / overlay helpers */
  SET_AVOID_RECTS: 'native_browser_set_avoid_rects',
  HIDE_ALL: 'native_browser_hide_all',
  SHOW_WORKSPACE: 'native_browser_show_workspace',
};

/** Shell / OS integration commands (E1+). */
const SHELL_COMMANDS = {
  PING: 'desktop_ping',
  WINDOW_MINIMIZE: 'window_minimize',
  WINDOW_MAXIMIZE: 'window_maximize',
  WINDOW_UNMAXIMIZE: 'window_unmaximize',
  WINDOW_TOGGLE_MAXIMIZE: 'window_toggle_maximize',
  WINDOW_CLOSE: 'window_close',
  WINDOW_IS_MAXIMIZED: 'window_is_maximized',
  WINDOW_SHOW: 'window_show',
  WINDOW_HIDE: 'window_hide',
  CLIPBOARD_READ_TEXT: 'read_system_clipboard_text',
  CLIPBOARD_WRITE_TEXT: 'write_system_clipboard_text',
  CLIPBOARD_READ_IMAGE: 'read_system_clipboard_image',
  CLIPBOARD_WRITE_IMAGE_TEMP: 'write_clipboard_image_to_temp_file',
  DIALOG_OPEN: 'dialog_open',
  NOTIFY_SHOW: 'notify_show',
  NOTIFY_PERMISSION: 'notify_request_permission',
  RUNTIME_STATUS: 'runtime_status',
  RUNTIME_ENSURE: 'runtime_ensure',
  LOG_CLIENT_ERROR: 'log_client_error',
};

/** Voice commands (E3) — names match Tauri where possible. */
const VOICE_COMMANDS = {
  TOGGLE_RECORDING: 'voice_toggle_recording',
  SET_ENABLED: 'voice_set_enabled',
  SET_SETTINGS: 'voice_set_settings',
  START_ENGINE: 'voice_start_engine',
  STOP_ENGINE: 'voice_stop_engine',
  STOP_SPEAK: 'voice_stop_speak',
  SPEAK: 'voice_speak',
};

/** Extra BrowserWindow helpers (E3). */
const MULTI_WINDOW_COMMANDS = {
  OPEN_URL_WINDOW: 'window_open_url',
  CLOSE_URL_WINDOW: 'window_close_url',
  LIST_URL_WINDOWS: 'window_list_url',
};

module.exports = {
  CHANNELS,
  NATIVE_BROWSER_COMMANDS,
  SHELL_COMMANDS,
  VOICE_COMMANDS,
  MULTI_WINDOW_COMMANDS,
};
