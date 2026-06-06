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
    this._contextLossHandlers = new Set();
  }
  // Real xterm-addon-webgl exposes onContextLoss(event) → IEvent<WebGLContextLostEvent>.
  // The terminal registers a handler that flips into DOM-fallback mode if the
  // WebGL context is lost (or fails to create). Tests use __triggerContextLoss
  // to fire any registered handler.
  onContextLoss(handler) {
    this._contextLossHandlers.add(handler);
    return {
      dispose: () => this._contextLossHandlers.delete(handler),
    };
  }
  __triggerContextLoss() {
    for (const handler of this._contextLossHandlers) {
      try {
        handler();
      } catch {
        // Swallow handler errors so test assertions can detect them via spies.
      }
    }
  }
  dispose() {
    this._contextLossHandlers.clear();
  }
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
