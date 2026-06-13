/**
 * JSDOM auto-mock for xterm-addon-canvas.
 */

class CanvasAddon {
  constructor() {
    CanvasAddon.instances.push(this);
  }

  dispose() {}
  clearTextureAtlas() {}
}

CanvasAddon.instances = [];
CanvasAddon.__reset = () => {
  CanvasAddon.instances = [];
};

export { CanvasAddon };
export default CanvasAddon;
