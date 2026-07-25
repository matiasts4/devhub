const domHarness = require('@/test-support/domHarness');

const {
  MAX_UPLOAD_BYTES,
  SCENERY_UPLOAD_ERRORS,
  readFileAsDataUrl,
  downscaleDataUrl,
  imageFileToWallpaperDataUrl,
} = require('../sceneryImageUpload');

let dom;
let originalFileReader;
let originalImage;

function mockFileReaderResult(dataUrl) {
  global.FileReader = class MockFileReader {
    readAsDataURL() {
      setTimeout(() => {
        this.result = dataUrl;
        if (this.onload) this.onload();
      }, 0);
    }
  };
}

function mockFileReaderError() {
  global.FileReader = class MockFileReader {
    readAsDataURL() {
      setTimeout(() => {
        if (this.onerror) this.onerror(new Error('read failed'));
      }, 0);
    }
  };
}

/** Mock Image so setting src fires onload with the given intrinsic size. */
function mockImageSize(width, height) {
  global.Image = class MockImage {
    set src(_value) {
      this.naturalWidth = width;
      this.naturalHeight = height;
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    }
  };
}

describe('sceneryImageUpload', () => {
  beforeEach(() => {
    dom = domHarness.installDom();
    originalFileReader = global.FileReader;
    originalImage = global.Image;
  });

  afterEach(() => {
    global.FileReader = originalFileReader;
    global.Image = originalImage;
    if (dom?.window?.close) dom.window.close();
  });

  describe('readFileAsDataUrl', () => {
    test('resolves with the data URL produced by FileReader', async () => {
      mockFileReaderResult('data:image/png;base64,AAAA');
      const result = await readFileAsDataUrl({ type: 'image/png' });
      expect(result).toBe('data:image/png;base64,AAAA');
    });

    test('rejects when FileReader errors', async () => {
      mockFileReaderError();
      await expect(readFileAsDataUrl({ type: 'image/png' })).rejects.toThrow(
        SCENERY_UPLOAD_ERRORS.READ_FAILED
      );
    });
  });

  describe('imageFileToWallpaperDataUrl', () => {
    test('rejects non-image files with a coded error', async () => {
      await expect(imageFileToWallpaperDataUrl({ type: 'text/plain', size: 10 })).rejects.toThrow(
        SCENERY_UPLOAD_ERRORS.NOT_AN_IMAGE
      );
    });

    test('rejects files above the size ceiling', async () => {
      await expect(
        imageFileToWallpaperDataUrl({ type: 'image/jpeg', size: MAX_UPLOAD_BYTES + 1 })
      ).rejects.toThrow(SCENERY_UPLOAD_ERRORS.TOO_LARGE);
    });

    test('resolves with the data URL for a valid image (no Image decoder -> passthrough)', async () => {
      // In the node test env Image is undefined, so downscale is a passthrough.
      global.Image = undefined;
      mockFileReaderResult('data:image/jpeg;base64,RAW');
      const result = await imageFileToWallpaperDataUrl({ type: 'image/jpeg', size: 1024 });
      expect(result).toBe('data:image/jpeg;base64,RAW');
    });
  });

  describe('downscaleDataUrl', () => {
    test('returns the input unchanged when Image is unavailable', async () => {
      global.Image = undefined;
      const result = await downscaleDataUrl('data:image/png;base64,RAW');
      expect(result).toBe('data:image/png;base64,RAW');
    });

    test('falls back to the input when canvas 2d context is unavailable', async () => {
      // JSDOM canvas getContext returns null by default -> graceful fallback.
      mockImageSize(4000, 2000);
      const result = await downscaleDataUrl('data:image/png;base64,RAW', { timeoutMs: 200 });
      expect(result).toBe('data:image/png;base64,RAW');
    });

    test('re-encodes a smaller JPEG when canvas is available', async () => {
      mockImageSize(4000, 2000);

      const drawImage = jest.fn();
      const proto = dom.window.HTMLCanvasElement.prototype;
      const originalGetContext = proto.getContext;
      const originalToDataURL = proto.toDataURL;
      proto.getContext = jest.fn(() => ({ drawImage }));
      proto.toDataURL = jest.fn(() => 'data:image/jpeg;base64,SMALL');

      try {
        const result = await downscaleDataUrl('data:image/png;base64,RAW', {
          maxDim: 2560,
          timeoutMs: 200,
        });
        expect(result).toBe('data:image/jpeg;base64,SMALL');
        // 4000x2000 scaled to longest edge 2560 -> 2560x1280.
        expect(drawImage).toHaveBeenCalled();
      } finally {
        proto.getContext = originalGetContext;
        proto.toDataURL = originalToDataURL;
      }
    });
  });
});
