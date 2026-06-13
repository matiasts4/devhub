/**
 * Browser-search action implementation.
 * 
 * Opens a browser surface and navigates to a search engine with the query.
 * 
 * @module commandBar/actions/browserSearch
 */

/**
 * Construct a search URL from a query string.
 * Uses DuckDuckGo as the default search engine.
 * 
 * @param {string} query - Search query
 * @returns {string} Search URL
 */
function constructSearchUrl(query) {
  // Use DuckDuckGo search
  // encodeURIComponent handles URL encoding, then replace %20 with + for cleaner URLs
  const encodedQuery = encodeURIComponent(query).replace(/%20/g, '+');
  return `https://duckduckgo.com/?q=${encodedQuery}`;
}

/**
 * Execute a browser-search action.
 * 
 * @param {import('../types').ResolvedIntent} intent - Resolved intent with browser-search type
 * @param {import('../types').SurfaceController} controller - Surface controller instance
 * @returns {Promise<{id: string}>} Browser surface info
 */
export async function browserSearch(intent, controller) {
  const { query } = intent.slots;

  // Validate query slot
  if (!query || query.trim() === '') {
    throw new Error('Query cannot be empty');
  }

  // Construct search URL
  const searchUrl = constructSearchUrl(query.trim());

  // Check for existing browser shape
  const existingBrowser = controller.findBrowser();

  if (existingBrowser) {
    // Reuse existing browser: focus + navigate to search
    controller.focusBrowser(existingBrowser.id);
    controller.updateElement(existingBrowser.id, { url: searchUrl });
    
    return { id: existingBrowser.id };
  }

  // No existing browser, spawn a new one
  return await controller.spawnBrowser({ url: searchUrl });
}
