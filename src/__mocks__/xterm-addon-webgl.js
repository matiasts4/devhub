/**
 * JSDOM auto-mock for xterm-addon-webgl.
 *
 * Picked up by Jest when a test imports the module. The mock:
 *   - tracks every constructed `WebglAddon` instance in a static array
 *     (so tests can assert `WebglAddon.instances.length`)
 *   - exposes a `__setLoadAddonThrow(true)` test seam that makes the
 *     next `terminal.loadAddon(...)` invocation throw (the addon
 *     construction itself does not throw in real life — the WebGL
 *     context creation inside `WebglRenderer.createRenderer` does).
 *     Test files wire this seam into their xterm mock's loadAddon.
 *   - exposes a `__reset()` helper to clear state between tests.
 */

class WebglAddon {
  constructor() {
    WebglAddon.instances.push(this);
  }
  dispose() {}
}
WebglAddon.instances = [];
WebglAddon.shouldThrow = false;
WebglAddon.__setLoadAddonThrow = (flag) => {
  WebglAddon.shouldThrow = Boolean(flag);
};
WebglAddon.__reset = () => {
  WebglAddon.instances = [];
  WebglAddon.shouldThrow = false;
};

export { WebglAddon };
export default WebglAddon;
