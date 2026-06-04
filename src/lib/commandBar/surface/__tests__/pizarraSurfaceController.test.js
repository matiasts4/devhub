/**
 * @jest-environment node
 */

// Mock fetch for terminal capture API
global.fetch = jest.fn();

describe('PizarraSurfaceController', () => {
  let createPizarraSurfaceController;
  let mockAddElement;
  let mockUpdateElement;
  let mockSetActiveTerminalId;
  let mockShapes;

  beforeEach(() => {
    jest.resetModules();
    global.fetch.mockClear();

    const module = require('../pizarraSurfaceController');
    createPizarraSurfaceController = module.createPizarraSurfaceController;

    mockAddElement = jest.fn();
    mockUpdateElement = jest.fn();
    mockSetActiveTerminalId = jest.fn();
    mockShapes = [];
  });

  test('spawnTerminal calls addElement with terminal shape props', async () => {
    const controller = createPizarraSurfaceController({
      addElement: mockAddElement,
      updateElement: mockUpdateElement,
      setActiveTerminalId: mockSetActiveTerminalId,
      shapes: mockShapes,
      activeTerminalId: null,
    });

    mockAddElement.mockImplementationOnce((shapeType, extraProps) => {
      return { id: 'terminal-1', type: shapeType, ...extraProps };
    });

    const result = await controller.spawnTerminal({
      label: 'test-terminal',
      initialCommand: 'npm test',
    });

    expect(mockAddElement).toHaveBeenCalledWith('terminal', {
      label: 'test-terminal',
      initialCommand: 'npm test',
    });
    expect(result.id).toBe('terminal-1');
    expect(result.label).toBe('test-terminal');
  });

  test('spawnTerminal without label uses default', async () => {
    const controller = createPizarraSurfaceController({
      addElement: mockAddElement,
      updateElement: mockUpdateElement,
      setActiveTerminalId: mockSetActiveTerminalId,
      shapes: mockShapes,
      activeTerminalId: null,
    });

    mockAddElement.mockImplementationOnce((shapeType, extraProps) => {
      return { id: 'terminal-2', type: shapeType, label: extraProps.label || 'Terminal' };
    });

    const result = await controller.spawnTerminal({
      initialCommand: 'git status',
    });

    expect(result.label).toBe('Terminal');
  });

  test('focusTerminal calls setActiveTerminalId', () => {
    const controller = createPizarraSurfaceController({
      addElement: mockAddElement,
      updateElement: mockUpdateElement,
      setActiveTerminalId: mockSetActiveTerminalId,
      shapes: mockShapes,
      activeTerminalId: null,
    });

    controller.focusTerminal('terminal-123');

    expect(mockSetActiveTerminalId).toHaveBeenCalledWith('terminal-123');
  });

  test('findTerminalByLabel finds existing terminal', () => {
    mockShapes = [
      { id: 'term-1', type: 'terminal', label: 'build-output' },
      { id: 'term-2', type: 'terminal', label: 'test-runner' },
      { id: 'browser-1', type: 'browser', url: 'https://example.com' },
    ];

    const controller = createPizarraSurfaceController({
      addElement: mockAddElement,
      updateElement: mockUpdateElement,
      setActiveTerminalId: mockSetActiveTerminalId,
      shapes: mockShapes,
      activeTerminalId: null,
    });

    const result = controller.findTerminalByLabel('build-output');

    expect(result).toEqual({ id: 'term-1', label: 'build-output' });
  });

  test('findTerminalByLabel returns null when not found', () => {
    mockShapes = [
      { id: 'term-1', type: 'terminal', label: 'existing' },
    ];

    const controller = createPizarraSurfaceController({
      addElement: mockAddElement,
      updateElement: mockUpdateElement,
      setActiveTerminalId: mockSetActiveTerminalId,
      shapes: mockShapes,
      activeTerminalId: null,
    });

    const result = controller.findTerminalByLabel('nonexistent');

    expect(result).toBeNull();
  });

  test('focusedTerminal returns active terminal info', () => {
    mockShapes = [
      { id: 'term-1', type: 'terminal', label: 'active-terminal' },
      { id: 'term-2', type: 'terminal', label: 'inactive-terminal' },
    ];

    const controller = createPizarraSurfaceController({
      addElement: mockAddElement,
      updateElement: mockUpdateElement,
      setActiveTerminalId: mockSetActiveTerminalId,
      shapes: mockShapes,
      activeTerminalId: 'term-1',
    });

    const result = controller.focusedTerminal();

    expect(result).toEqual({ id: 'term-1', label: 'active-terminal' });
  });

  test('focusedTerminal returns null when no active terminal', () => {
    const controller = createPizarraSurfaceController({
      addElement: mockAddElement,
      updateElement: mockUpdateElement,
      setActiveTerminalId: mockSetActiveTerminalId,
      shapes: mockShapes,
      activeTerminalId: null,
    });

    const result = controller.focusedTerminal();

    expect(result).toBeNull();
  });

  test('listTerminals returns all terminal shapes', () => {
    mockShapes = [
      { id: 'term-1', type: 'terminal', label: 'Terminal 1' },
      { id: 'browser-1', type: 'browser', url: 'https://example.com' },
      { id: 'term-2', type: 'terminal', label: 'Terminal 2' },
    ];

    const controller = createPizarraSurfaceController({
      addElement: mockAddElement,
      updateElement: mockUpdateElement,
      setActiveTerminalId: mockSetActiveTerminalId,
      shapes: mockShapes,
      activeTerminalId: null,
    });

    const result = controller.listTerminals();

    expect(result).toEqual([
      { id: 'term-1', label: 'Terminal 1' },
      { id: 'term-2', label: 'Terminal 2' },
    ]);
  });

  test('captureTerminal calls GET /api/terminal/session/{id}/capture', async () => {
    const controller = createPizarraSurfaceController({
      addElement: mockAddElement,
      updateElement: mockUpdateElement,
      setActiveTerminalId: mockSetActiveTerminalId,
      shapes: mockShapes,
      activeTerminalId: null,
    });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ output: 'terminal output text' }),
    });

    const result = await controller.captureTerminal('terminal-123');

    expect(global.fetch).toHaveBeenCalledWith('/api/terminal/session/terminal-123/capture');
    expect(result).toBe('terminal output text');
  });

  test('captureTerminal throws if API call fails', async () => {
    const controller = createPizarraSurfaceController({
      addElement: mockAddElement,
      updateElement: mockUpdateElement,
      setActiveTerminalId: mockSetActiveTerminalId,
      shapes: mockShapes,
      activeTerminalId: null,
    });

    global.fetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
    });

    await expect(controller.captureTerminal('terminal-999')).rejects.toThrow(/Failed to capture/i);
  });

  describe('browser methods', () => {
    test('spawnBrowser calls addElement with browser shape props', async () => {
      mockShapes = [];
      const controller = createPizarraSurfaceController({
        addElement: mockAddElement,
        updateElement: mockUpdateElement,
        setActiveTerminalId: mockSetActiveTerminalId,
        shapes: mockShapes,
        activeTerminalId: null,
      });

      mockAddElement.mockImplementationOnce((shapeType, extraProps) => {
        return { id: 'browser-1', type: shapeType, ...extraProps };
      });

      const result = await controller.spawnBrowser({
        url: 'https://github.com',
      });

      expect(mockAddElement).toHaveBeenCalledWith('browser', {
        url: 'https://github.com',
      });
      expect(result.id).toBe('browser-1');
    });

    test('focusBrowser sets the browser as active (no-op for now)', () => {
      const controller = createPizarraSurfaceController({
        addElement: mockAddElement,
        updateElement: mockUpdateElement,
        setActiveTerminalId: mockSetActiveTerminalId,
        shapes: mockShapes,
        activeTerminalId: null,
      });

      // Browser focus doesn't have a specific state yet, just verify it doesn't throw
      expect(() => controller.focusBrowser('browser-1')).not.toThrow();
    });

    test('findBrowser returns most-recently-focused browser shape', () => {
      mockShapes = [
        { id: 'browser-1', type: 'browser', url: 'https://old.com', x: 100, y: 100 },
        { id: 'term-1', type: 'terminal', label: 'Terminal' },
        { id: 'browser-2', type: 'browser', url: 'https://new.com', x: 200, y: 200 },
      ];

      const controller = createPizarraSurfaceController({
        addElement: mockAddElement,
        updateElement: mockUpdateElement,
        setActiveTerminalId: mockSetActiveTerminalId,
        shapes: mockShapes,
        activeTerminalId: null,
      });

      const result = controller.findBrowser();

      // Should return the last browser (most recently added)
      expect(result).toEqual({
        id: 'browser-2',
        url: 'https://new.com',
      });
    });

    test('findBrowser returns null when no browsers exist', () => {
      mockShapes = [
        { id: 'term-1', type: 'terminal', label: 'Terminal' },
      ];

      const controller = createPizarraSurfaceController({
        addElement: mockAddElement,
        updateElement: mockUpdateElement,
        setActiveTerminalId: mockSetActiveTerminalId,
        shapes: mockShapes,
        activeTerminalId: null,
      });

      const result = controller.findBrowser();

      expect(result).toBeNull();
    });
  });
});
