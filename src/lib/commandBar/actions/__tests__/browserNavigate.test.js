/**
 * @jest-environment node
 */

describe('browserNavigate action', () => {
  let browserNavigate;

  beforeEach(() => {
    jest.resetModules();
    const module = require('../browserNavigate');
    browserNavigate = module.browserNavigate;
  });

  describe('URL normalization', () => {
    test('URL with protocol is used as-is', async () => {
      const intent = {
        intent: 'browser-navigate',
        slots: { url: 'https://github.com' },
      };

      const controller = {
        spawnBrowser: jest.fn().mockResolvedValue({ id: 'browser-1' }),
        findBrowser: jest.fn().mockReturnValue(null),
      };

      await browserNavigate(intent, controller);

      expect(controller.spawnBrowser).toHaveBeenCalledWith({
        url: 'https://github.com',
      });
    });

    test('URL without protocol gets https:// prefix', async () => {
      const intent = {
        intent: 'browser-navigate',
        slots: { url: 'github.com' },
      };

      const controller = {
        spawnBrowser: jest.fn().mockResolvedValue({ id: 'browser-1' }),
        findBrowser: jest.fn().mockReturnValue(null),
      };

      await browserNavigate(intent, controller);

      expect(controller.spawnBrowser).toHaveBeenCalledWith({
        url: 'https://github.com',
      });
    });

    test('localhost URL without protocol gets http:// prefix', async () => {
      const intent = {
        intent: 'browser-navigate',
        slots: { url: 'localhost:3000' },
      };

      const controller = {
        spawnBrowser: jest.fn().mockResolvedValue({ id: 'browser-1' }),
        findBrowser: jest.fn().mockReturnValue(null),
      };

      await browserNavigate(intent, controller);

      expect(controller.spawnBrowser).toHaveBeenCalledWith({
        url: 'http://localhost:3000',
      });
    });
  });

  describe('browser reuse', () => {
    test('spawns new browser if none exists', async () => {
      const intent = {
        intent: 'browser-navigate',
        slots: { url: 'github.com' },
      };

      const controller = {
        spawnBrowser: jest.fn().mockResolvedValue({ id: 'browser-1' }),
        findBrowser: jest.fn().mockReturnValue(null),
      };

      const result = await browserNavigate(intent, controller);

      expect(controller.findBrowser).toHaveBeenCalled();
      expect(controller.spawnBrowser).toHaveBeenCalledWith({
        url: 'https://github.com',
      });
      expect(result).toEqual({ id: 'browser-1' });
    });

    test('reuses existing browser by focusing and updating URL', async () => {
      const intent = {
        intent: 'browser-navigate',
        slots: { url: 'example.com' },
      };

      const existingBrowser = { id: 'browser-existing', url: 'old-url.com' };
      const controller = {
        findBrowser: jest.fn().mockReturnValue(existingBrowser),
        focusBrowser: jest.fn(),
        updateElement: jest.fn(),
        spawnBrowser: jest.fn(),
      };

      const result = await browserNavigate(intent, controller);

      expect(controller.findBrowser).toHaveBeenCalled();
      expect(controller.focusBrowser).toHaveBeenCalledWith('browser-existing');
      expect(controller.updateElement).toHaveBeenCalledWith('browser-existing', {
        url: 'https://example.com',
      });
      expect(controller.spawnBrowser).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'browser-existing' });
    });
  });

  describe('error handling', () => {
    test('empty URL slot throws error', async () => {
      const intent = {
        intent: 'browser-navigate',
        slots: { url: '' },
      };

      const controller = {
        spawnBrowser: jest.fn(),
        findBrowser: jest.fn(),
      };

      await expect(browserNavigate(intent, controller)).rejects.toThrow('URL cannot be empty');
    });

    test('browser spawn error is propagated', async () => {
      const intent = {
        intent: 'browser-navigate',
        slots: { url: 'github.com' },
      };

      const controller = {
        findBrowser: jest.fn().mockReturnValue(null),
        spawnBrowser: jest.fn().mockRejectedValue(new Error('Failed to spawn browser')),
      };

      await expect(browserNavigate(intent, controller)).rejects.toThrow('Failed to spawn browser');
    });
  });
});
