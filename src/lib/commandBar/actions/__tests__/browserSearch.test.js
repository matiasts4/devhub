/**
 * @jest-environment node
 */

describe('browserSearch action', () => {
  let browserSearch;

  beforeEach(() => {
    jest.resetModules();
    const module = require('../browserSearch');
    browserSearch = module.browserSearch;
  });

  describe('search URL construction', () => {
    test('constructs DuckDuckGo search URL from query', async () => {
      const intent = {
        intent: 'browser-search',
        slots: { query: 'typescript docs' },
      };

      const controller = {
        spawnBrowser: jest.fn().mockResolvedValue({ id: 'browser-1' }),
        findBrowser: jest.fn().mockReturnValue(null),
      };

      await browserSearch(intent, controller);

      expect(controller.spawnBrowser).toHaveBeenCalledWith({
        url: 'https://duckduckgo.com/?q=typescript+docs',
      });
    });

    test('URL-encodes query with special characters', async () => {
      const intent = {
        intent: 'browser-search',
        slots: { query: 'react hooks & effects' },
      };

      const controller = {
        spawnBrowser: jest.fn().mockResolvedValue({ id: 'browser-1' }),
        findBrowser: jest.fn().mockReturnValue(null),
      };

      await browserSearch(intent, controller);

      expect(controller.spawnBrowser).toHaveBeenCalledWith({
        url: 'https://duckduckgo.com/?q=react+hooks+%26+effects',
      });
    });
  });

  describe('browser reuse', () => {
    test('spawns new browser if none exists', async () => {
      const intent = {
        intent: 'browser-search',
        slots: { query: 'rust ownership' },
      };

      const controller = {
        spawnBrowser: jest.fn().mockResolvedValue({ id: 'browser-1' }),
        findBrowser: jest.fn().mockReturnValue(null),
      };

      const result = await browserSearch(intent, controller);

      expect(controller.findBrowser).toHaveBeenCalled();
      expect(controller.spawnBrowser).toHaveBeenCalledWith({
        url: 'https://duckduckgo.com/?q=rust+ownership',
      });
      expect(result).toEqual({ id: 'browser-1' });
    });

    test('reuses existing browser by navigating to search URL', async () => {
      const intent = {
        intent: 'browser-search',
        slots: { query: 'jest mocking' },
      };

      const existingBrowser = { id: 'browser-existing', url: 'old-url.com' };
      const controller = {
        findBrowser: jest.fn().mockReturnValue(existingBrowser),
        focusBrowser: jest.fn(),
        updateElement: jest.fn(),
        spawnBrowser: jest.fn(),
      };

      const result = await browserSearch(intent, controller);

      expect(controller.findBrowser).toHaveBeenCalled();
      expect(controller.focusBrowser).toHaveBeenCalledWith('browser-existing');
      expect(controller.updateElement).toHaveBeenCalledWith('browser-existing', {
        url: 'https://duckduckgo.com/?q=jest+mocking',
      });
      expect(controller.spawnBrowser).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'browser-existing' });
    });
  });

  describe('error handling', () => {
    test('empty query slot throws error', async () => {
      const intent = {
        intent: 'browser-search',
        slots: { query: '' },
      };

      const controller = {
        spawnBrowser: jest.fn(),
        findBrowser: jest.fn(),
      };

      await expect(browserSearch(intent, controller)).rejects.toThrow('Query cannot be empty');
    });
  });
});
