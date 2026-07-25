/**
 * Pizarra surface controller implementation.
 *
 * Adapter that bridges CommandBar actions to Pizarra canvas operations.
 * Implements the SurfaceController port for dependency inversion.
 *
 * @module commandBar/surface/pizarraSurfaceController
 */

/**
 * Create a Pizarra surface controller.
 *
 * @param {Object} deps - Dependencies
 * @param {Function} deps.addElement - Function to add elements to canvas (type, extraProps)
 * @param {Function} deps.updateElement - Function to update elements (id, changes)
 * @param {Function} deps.setActiveTerminalId - Function to set active terminal
 * @param {Array} deps.shapes - Array of current shapes on canvas
 * @param {string|null} deps.activeTerminalId - Currently active terminal ID
 * @returns {import('../types').SurfaceController}
 */
export function createPizarraSurfaceController({
  addElement,
  updateElement,
  setActiveTerminalId,
  shapes,
  activeTerminalId,
}) {
  return {
    /**
     * Spawn a new terminal surface.
     */
    async spawnTerminal(opts = {}) {
      const { label, initialCommand } = opts;

      // Delegate to Pizarra's addElement with extra props. The
      // requestedRendererMode pin honors the new global default
      // (xterm-webgl) for command-bar spawns even if the resolver layer
      // is bypassed; existing per-panel overrides still take precedence.
      const shape = addElement('terminal', {
        label: label || 'Terminal',
        initialCommand,
        requestedRendererMode: 'xterm-webgl',
      });

      return {
        id: shape.id,
        label: shape.label || label || 'Terminal',
      };
    },

    /**
     * Focus an existing terminal by ID.
     */
    focusTerminal(id) {
      setActiveTerminalId(id);
    },

    /**
     * Find a terminal by its label.
     */
    findTerminalByLabel(label) {
      const terminal = shapes.find((shape) => shape.type === 'terminal' && shape.label === label);

      if (!terminal) {
        return null;
      }

      return {
        id: terminal.id,
        label: terminal.label,
      };
    },

    /**
     * Get the currently focused terminal.
     */
    focusedTerminal() {
      if (!activeTerminalId) {
        return null;
      }

      const terminal = shapes.find(
        (shape) => shape.id === activeTerminalId && shape.type === 'terminal'
      );

      if (!terminal) {
        return null;
      }

      return {
        id: terminal.id,
        label: terminal.label || 'Terminal',
      };
    },

    /**
     * List all terminal surfaces.
     */
    listTerminals() {
      return shapes
        .filter((shape) => shape.type === 'terminal')
        .map((shape) => ({
          id: shape.id,
          label: shape.label || 'Terminal',
        }));
    },

    /**
     * Capture terminal output (raw history string).
     * Calls the existing /api/terminal/session/{id}/capture route.
     */
    async captureTerminal(id) {
      const response = await fetch(`/api/terminal/session/${id}/capture`);

      if (!response.ok) {
        throw new Error(`Failed to capture terminal output: ${response.statusText}`);
      }

      const data = await response.json();
      return data.output || '';
    },

    /**
     * Spawn a new browser surface.
     */
    async spawnBrowser(opts = {}) {
      const { url } = opts;

      // Delegate to Pizarra's addElement with extra props
      const shape = addElement('browser', {
        url,
      });

      return {
        id: shape.id,
      };
    },

    /**
     * Focus an existing browser by ID.
     * Currently a no-op as browser focus state is not tracked separately.
     */
    focusBrowser(_id) {
      // Browser focus is not tracked separately in the current implementation
      // This is intentionally a no-op for now
    },

    /**
     * Find the most-recently-focused browser shape.
     * Returns the last browser in the shapes array (most recently added).
     */
    findBrowser() {
      // Find all browser shapes
      const browsers = shapes.filter((shape) => shape.type === 'browser');

      if (browsers.length === 0) {
        return null;
      }

      // Return the last browser (most recently added)
      const lastBrowser = browsers[browsers.length - 1];

      return {
        id: lastBrowser.id,
        url: lastBrowser.url,
      };
    },

    /**
     * Update an element's properties.
     * Delegates to Pizarra's updateElement.
     */
    updateElement(id, changes) {
      updateElement(id, changes);
    },
  };
}
