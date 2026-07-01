import {
  fileToBase64,
  readClipboardImageFromEvent,
  readClipboardTextFromEvent,
  terminalClipboardEventBelongsToPanel,
} from '../terminalClipboard';

function withFileReaderMock(resultDataUrl) {
  const original = global.FileReader;
  global.FileReader = class MockFileReader {
    readAsDataURL() {
      setTimeout(() => {
        this.result = resultDataUrl;
        if (this.onload) this.onload();
      }, 0);
    }
  };
  return () => {
    global.FileReader = original;
  };
}

function setNavigator(value) {
  Object.defineProperty(global, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
}

function resetNavigator() {
  Object.defineProperty(global, 'navigator', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

function loadClipboardWithTauriMock(invokeMap) {
  jest.resetModules();
  jest.doMock('@tauri-apps/api/core', () => ({
    invoke: jest.fn(async (command, args) => {
      const handler = invokeMap[command];
      if (!handler) throw new Error(`unexpected invoke: ${command}`);
      return handler(args);
    }),
  }));
  return require('../terminalClipboard');
}

describe('terminalClipboardEventBelongsToPanel()', () => {
  test('returns false when focus is in an external textarea even if panel is active', () => {
    const root = { contains: (node) => node?.id === 'inside-root' };
    const textarea = { id: 'modal-textarea', tagName: 'TEXTAREA', isContentEditable: false };

    expect(
      terminalClipboardEventBelongsToPanel({
        rootElement: root,
        activeElement: textarea,
        eventTarget: textarea,
        isActivePanel: true,
      })
    ).toBe(false);
  });

  test('returns true for active panel when focus is not in another editable control', () => {
    const shell = { id: 'inside-root', tagName: 'DIV', isContentEditable: false };
    const root = { contains: (node) => node?.id === 'inside-root' };

    expect(
      terminalClipboardEventBelongsToPanel({
        rootElement: root,
        activeElement: shell,
        eventTarget: shell,
        isActivePanel: true,
      })
    ).toBe(true);
  });
});

describe('readClipboardTextFromEvent()', () => {
  test('reads plain text from a paste event', () => {
    const event = {
      clipboardData: {
        getData: (type) => (type === 'text/plain' ? 'hello swarm' : ''),
      },
    };

    expect(readClipboardTextFromEvent(event)).toBe('hello swarm');
  });
});

describe('readClipboardImageFromEvent()', () => {
  test('returns the first image file from clipboard items', () => {
    const file = new File(['binary'], 'paste.png', { type: 'image/png' });
    const event = {
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: 'image/png', getAsFile: () => file },
        ],
      },
    };

    const result = readClipboardImageFromEvent(event);
    expect(result).toEqual({ file, mimeType: 'image/png' });
  });

  test('returns null when no image files are present', () => {
    const event = {
      clipboardData: {
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
      },
    };

    expect(readClipboardImageFromEvent(event)).toBeNull();
  });
});

describe('fileToBase64()', () => {
  let restoreFileReader;

  beforeEach(() => {
    restoreFileReader = withFileReaderMock('data:text/plain;base64,aGVsbG8=');
  });

  afterEach(() => {
    restoreFileReader();
  });

  test('resolves base64 payload and mime type from a File', async () => {
    const file = new File(['hello'], 'paste.txt', { type: 'text/plain' });

    const result = await fileToBase64(file);

    expect(result.mimeType).toBe('text/plain');
    expect(result.data).toBe('aGVsbG8=');
  });
});

describe('readClipboardText()', () => {
  afterEach(() => {
    resetNavigator();
  });

  test('falls back to Tauri when navigator clipboard is unavailable', async () => {
    setNavigator({});
    const { readClipboardText: readText } = loadClipboardWithTauriMock({
      read_system_clipboard_text: () => 'tauri text',
    });

    const result = await readText();
    expect(result).toBe('tauri text');
  });
});

describe('readClipboardImage()', () => {
  let restoreFileReader;

  beforeEach(() => {
    restoreFileReader = withFileReaderMock('data:image/png;base64,ZmlsZS1kYXRh');
  });

  afterEach(() => {
    restoreFileReader();
    resetNavigator();
  });

  test('reads image from paste event', async () => {
    const file = new File(['binary'], 'paste.png', { type: 'image/png' });
    const event = {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      },
    };

    const result = await readClipboardImageFromEvent(event);
    expect(result.mimeType).toBe('image/png');
    const base64 = await fileToBase64(result.file);
    expect(base64.data).toBe('ZmlsZS1kYXRh');
  });

  test('falls back to navigator.clipboard.read()', async () => {
    const file = new File(['blob-image'], 'paste.png', { type: 'image/png' });
    setNavigator({
      clipboard: {
        read: jest.fn(async () => [
          {
            types: ['image/png'],
            getType: jest.fn(async () => file),
          },
        ]),
      },
    });

    const { readClipboardImage: readImage } = loadClipboardWithTauriMock({
      read_system_clipboard_image: () => null,
    });

    const result = await readImage();
    expect(result.mimeType).toBe('image/png');
    expect(result.data).toBe('ZmlsZS1kYXRh');
  });

  test('falls back to Tauri native clipboard', async () => {
    setNavigator({ clipboard: {} });
    const { readClipboardImage: readImage } = loadClipboardWithTauriMock({
      read_system_clipboard_image: () => ({
        data: 'dGF1cmk=',
        mime_type: 'image/png',
      }),
    });

    const result = await readImage();
    expect(result).toEqual({ data: 'dGF1cmk=', mimeType: 'image/png' });
  });

  test('returns null when no image is available', async () => {
    setNavigator({ clipboard: {} });
    const { readClipboardImage: readImage } = loadClipboardWithTauriMock({
      read_system_clipboard_image: () => null,
    });

    const result = await readImage();
    expect(result).toBeNull();
  });
});

describe('saveClipboardImageToTempFile()', () => {
  test('invokes write_clipboard_image_to_temp_file with extension from mimeType', async () => {
    const invokeMap = {
      write_clipboard_image_to_temp_file: jest.fn(async () => 'C:\\tmp\\paste.png'),
    };
    const { saveClipboardImageToTempFile: saveImage } = loadClipboardWithTauriMock(invokeMap);

    const result = await saveImage({ data: 'aGVsbG8=', mimeType: 'image/png' });

    expect(result).toBe('C:\\tmp\\paste.png');
    expect(invokeMap.write_clipboard_image_to_temp_file).toHaveBeenCalledWith({
      dataBase64: 'aGVsbG8=',
      extension: 'png',
    });
  });

  test('returns null when invoke fails', async () => {
    const { saveClipboardImageToTempFile: saveImage } = loadClipboardWithTauriMock({
      write_clipboard_image_to_temp_file: async () => {
        throw new Error('no Tauri runtime');
      },
    });

    const result = await saveImage({ data: 'aGVsbG8=' });
    expect(result).toBeNull();
  });
});
