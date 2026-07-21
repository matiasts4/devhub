'use strict';

const { NATIVE_BROWSER_COMMANDS } = require('../channels');

/**
 * Route Tauri-compatible native browser command names to registry methods.
 */
function handleNativeBrowserCommand(registry, command, payload = {}) {
  switch (command) {
    case NATIVE_BROWSER_COMMANDS.PROBE:
      return registry.probe(payload);
    case NATIVE_BROWSER_COMMANDS.OPEN:
      return registry.open(payload);
    case NATIVE_BROWSER_COMMANDS.LOAD:
      return registry.loadUrl(payload);
    case NATIVE_BROWSER_COMMANDS.RELOAD:
      return registry.reload(payload);
    case NATIVE_BROWSER_COMMANDS.GO_BACK:
      return registry.goBack(payload);
    case NATIVE_BROWSER_COMMANDS.GO_FORWARD:
      return registry.goForward(payload);
    case NATIVE_BROWSER_COMMANDS.CAPTURE:
      return registry.capture(payload);
    case NATIVE_BROWSER_COMMANDS.RELEASE_FOCUS:
      return registry.releaseFocus(payload);
    case NATIVE_BROWSER_COMMANDS.RESIZE:
      return registry.resize(payload);
    case NATIVE_BROWSER_COMMANDS.FOCUS:
      return registry.focus(payload);
    case NATIVE_BROWSER_COMMANDS.RAISE:
      return registry.raise(payload);
    case NATIVE_BROWSER_COMMANDS.VISIBILITY:
      return registry.setVisibility(payload);
    case NATIVE_BROWSER_COMMANDS.SELECTOR:
      return registry.selectorCommand(payload);
    case NATIVE_BROWSER_COMMANDS.SELECT_ALL:
      return registry.selectAll(payload);
    case NATIVE_BROWSER_COMMANDS.COPY:
      return registry.copy(payload);
    case NATIVE_BROWSER_COMMANDS.CLOSE:
      return registry.close(payload);
    case NATIVE_BROWSER_COMMANDS.SET_AVOID_RECTS:
      return registry.setAvoidRects(payload);
    case NATIVE_BROWSER_COMMANDS.HIDE_ALL:
      return registry.hideAll(payload);
    case NATIVE_BROWSER_COMMANDS.SHOW_WORKSPACE:
      return registry.showWorkspace(payload);
    default:
      return { reason: 'not-implemented', command };
  }
}

function isNativeBrowserCommand(command) {
  return Object.values(NATIVE_BROWSER_COMMANDS).includes(command);
}

module.exports = { handleNativeBrowserCommand, isNativeBrowserCommand };
