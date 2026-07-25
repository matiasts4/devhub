/**
 * Scenery Image Upload — turn a user-picked image file into a wallpaper
 * data-URL that can be persisted as the custom scenery background.
 *
 * Pipeline:
 *   1. Validate the file is an image and below a hard size ceiling.
 *   2. Read it into a data-URL via FileReader.
 *   3. Best-effort downscale (longest edge -> WALLPAPER_MAX_DIM) and re-encode
 *      as JPEG so the result stays small enough for localStorage. If the
 *      browser cannot decode / draw (headless env, no canvas), the original
 *      data-URL is returned unchanged — never a hard failure.
 *
 * The functions are dependency-light and SSR-safe so they can be unit tested
 * under JSDOM with a mocked FileReader / Image.
 */

/** Reject files larger than this before even reading them (bytes). */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** Longest edge (px) the wallpaper is downscaled to before persisting. */
export const WALLPAPER_MAX_DIM = 2560;

/** JPEG quality used when re-encoding the downscaled wallpaper (0..1). */
export const WALLPAPER_JPEG_QUALITY = 0.85;

/** Safety net so a stalled decode can never hang the upload (ms). */
export const DOWNSCALE_TIMEOUT_MS = 5000;

/** Error codes surfaced to the UI for friendly messages. */
export const SCENERY_UPLOAD_ERRORS = {
  NOT_AN_IMAGE: 'scenery-upload:not-an-image',
  TOO_LARGE: 'scenery-upload:too-large',
  READ_FAILED: 'scenery-upload:read-failed',
};

/**
 * Read a File/Blob into a data-URL. Promise wrapper around FileReader.
 * @param {File|Blob} file
 * @returns {Promise<string>} data-URL
 */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error(SCENERY_UPLOAD_ERRORS.READ_FAILED));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.startsWith('data:')) {
        resolve(result);
      } else {
        reject(new Error(SCENERY_UPLOAD_ERRORS.READ_FAILED));
      }
    };
    reader.onerror = () => reject(reader.error || new Error(SCENERY_UPLOAD_ERRORS.READ_FAILED));
    reader.readAsDataURL(file);
  });
}

/**
 * Best-effort downscale of a data-URL image. Resolves with a smaller JPEG
 * data-URL when possible, otherwise with the original input. Never rejects.
 *
 * @param {string} dataUrl - source image data-URL
 * @param {object} [opts]
 * @param {number} [opts.maxDim] - longest edge target (default WALLPAPER_MAX_DIM)
 * @param {number} [opts.quality] - JPEG quality (default WALLPAPER_JPEG_QUALITY)
 * @param {number} [opts.timeoutMs] - decode safety timeout (default DOWNSCALE_TIMEOUT_MS)
 * @returns {Promise<string>}
 */
export function downscaleDataUrl(dataUrl, opts = {}) {
  const {
    maxDim = WALLPAPER_MAX_DIM,
    quality = WALLPAPER_JPEG_QUALITY,
    timeoutMs = DOWNSCALE_TIMEOUT_MS,
  } = opts;

  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(dataUrl);
      return;
    }

    let done = false;
    let timer;
    const finish = (value) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    // Never hang if the image decode stalls (also keeps tests fast).
    timer = setTimeout(() => finish(dataUrl), timeoutMs);

    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return finish(dataUrl);

        const scale = Math.min(1, maxDim / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * scale));
        const targetH = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(dataUrl);

        ctx.drawImage(img, 0, 0, targetW, targetH);
        const out = canvas.toDataURL('image/jpeg', quality);
        finish(out || dataUrl);
      } catch {
        finish(dataUrl);
      }
    };
    img.onerror = () => finish(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Convert a user-picked image File into a wallpaper-ready data-URL.
 * Rejects with a coded Error for non-images or oversized files.
 *
 * @param {File} file
 * @param {object} [opts] - forwarded to downscaleDataUrl
 * @returns {Promise<string>} data-URL to store as `customImageUrl`
 */
export async function imageFileToWallpaperDataUrl(file, opts = {}) {
  if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    throw new Error(SCENERY_UPLOAD_ERRORS.NOT_AN_IMAGE);
  }
  if (typeof file.size === 'number' && file.size > MAX_UPLOAD_BYTES) {
    throw new Error(SCENERY_UPLOAD_ERRORS.TOO_LARGE);
  }
  const raw = await readFileAsDataUrl(file);
  return downscaleDataUrl(raw, opts);
}
