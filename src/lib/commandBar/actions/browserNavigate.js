/**
 * Browser-navigate action implementation.
 * 
 * Opens or re-navigates a native browser surface to the specified URL.
 * 
 * @module commandBar/actions/browserNavigate
 */

/**
 * Normalize a URL by adding protocol if missing.
 * 
 * @param {string} url - Raw URL from user input
 * @returns {string} Normalized URL with protocol
 */
function normalizeUrl(url) {
  // Already has protocol
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // localhost gets http:// by default
  if (url.startsWith('localhost')) {
    return `http://${url}`;
  }

  // Everything else gets https://
  return `https://${url}`;
}

/**
 * Execute a browser-navigate action.
 * 
 * @param {import('../types').ResolvedIntent} intent - Resolved intent with browser-navigate type
 * @param {import('../types').SurfaceController} controller - Surface controller instance
 * @returns {Promise<{id: string}>} Browser surface info
 */
export async function browserNavigate(intent, controller) {
  const { url } = intent.slots;

  // Validate URL slot
  if (!url || url.trim() === '') {
    throw new Error('URL cannot be empty');
  }

  // Normalize URL (add protocol if missing)
  const normalizedUrl = normalizeUrl(url.trim());

  // Check for existing browser shape
  const existingBrowser = controller.findBrowser();

  if (existingBrowser) {
    // Reuse existing browser: focus + update URL
    controller.focusBrowser(existingBrowser.id);
    controller.updateElement(existingBrowser.id, { url: normalizedUrl });
    
    return { id: existingBrowser.id };
  }

  // No existing browser, spawn a new one
  return await controller.spawnBrowser({ url: normalizedUrl });
}
