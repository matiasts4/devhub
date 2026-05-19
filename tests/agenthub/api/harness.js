/**
 * ApiTestHarness — HTTP-aware test harness for AgentHub API route tests.
 *
 * Extends the base TestHarness with fetch capabilities against a running
 * Next.js dev server. Integrates with the lock lifecycle for test isolation.
 *
 * Usage:
 *   const harness = new ApiTestHarness({
 *     baseUrl: 'http://localhost:3100',
 *     dbPath: ':memory:',
 *     lockOwner: 'test-headless-1'
 *   });
 *   await harness.setupDb();
 *   const res = await harness.request('POST', '/api/agenthub/headless', { prompt: 'hi' });
 *   harness.assertStatus(res, 200);
 *   harness.assertBodyShape(body, ['success', 'sessionID']);
 *   await harness.teardownDb();
 */

const { TestHarness } = require('../harness');
const { assertHttpStatus, assertBodyShape } = require('../assertions');

const DEFAULT_BASE_URL = 'http://localhost:3100';
const DEFAULT_SERVER_PROBE_PATH = '/api/agenthub/sessions?limit=1';
const fetchImpl = global.fetch;
const reachabilityCache = new Map();
const warnedUnavailableBaseUrls = new Set();

function getAgentHubBaseUrl() {
  return process.env.AGENTHUB_BASE_URL || DEFAULT_BASE_URL;
}

function normalizeBaseUrl(baseUrl = getAgentHubBaseUrl()) {
  return baseUrl.replace(/\/+$/, '');
}

async function isAgentHubServerReachable(baseUrl = getAgentHubBaseUrl(), options = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const timeoutMs = options.timeoutMs ?? 3000;
  const probePath = options.path ?? DEFAULT_SERVER_PROBE_PATH;
  const cacheKey = `${normalizedBaseUrl}|${probePath}|${timeoutMs}`;

  if (!options.fresh && reachabilityCache.has(cacheKey)) {
    return reachabilityCache.get(cacheKey);
  }

  const probePromise = (async () => {
    if (typeof fetchImpl !== 'function') {
      return false;
    }

    try {
      const response = await fetchImpl(`${normalizedBaseUrl}${probePath}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return response.ok || response.status === 200;
    } catch {
      return false;
    }
  })();

  if (!options.fresh) {
    reachabilityCache.set(cacheKey, probePromise);
  }

  return probePromise;
}

function resetAgentHubServerReachabilityCache() {
  reachabilityCache.clear();
  warnedUnavailableBaseUrls.clear();
}

function warnServerUnavailable(baseUrl) {
  if (warnedUnavailableBaseUrls.has(baseUrl)) {
    return;
  }

  warnedUnavailableBaseUrls.add(baseUrl);
  console.warn('SKIP: Next.js server not reachable at', baseUrl);
}

class ApiTestHarness extends TestHarness {
  /**
   * @param {object} options
   * @param {string} [options.baseUrl] - Next.js server URL (default: http://localhost:3100)
   * @param {string} [options.dbPath] - SQLite DB path (default: ':memory:')
   * @param {string} [options.lockOwner] - Lock owner identifier
   */
  constructor({ baseUrl = getAgentHubBaseUrl(), dbPath = ':memory:', lockOwner = 'api-test' } = {}) {
    super({ dbPath, lockOwner });
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async isServerReachable(options = {}) {
    return isAgentHubServerReachable(this.baseUrl, options);
  }

  async skipIfServerUnavailable(options = {}) {
    const reachable = await this.isServerReachable(options);
    if (reachable) {
      return false;
    }

    warnServerUnavailable(this.baseUrl);
    return true;
  }

  /**
   * Make an HTTP request to the running Next.js server.
   *
   * @param {string} method - HTTP method (GET, POST, PUT, PATCH, DELETE)
   * @param {string} path - API path (e.g., '/api/agenthub/headless')
   * @param {object|string} [body] - Request body (auto-stringified if object)
   * @param {object} [options] - Additional fetch options
   * @param {object} [options.headers] - Additional headers
   * @param {number} [options.timeout] - Request timeout in ms (default: 30000)
   * @returns {Promise<Response>}
   */
  async request(method, path, body, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const fetchOptions = {
      method: method.toUpperCase(),
      headers,
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    };

    if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    if (typeof fetchImpl !== 'function') {
      throw new Error('Global fetch is unavailable in this Jest runtime');
    }

    const response = await fetchImpl(url, fetchOptions);
    return response;
  }

  /**
   * Make a request and parse the JSON response body.
   *
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {object|string} [body] - Request body
   * @param {object} [options] - Additional fetch options
   * @returns {Promise<{response: Response, body: object}>}
   */
  async requestJson(method, path, body, options = {}) {
    const response = await this.request(method, path, body, options);
    let parsedBody = null;
    try {
      const text = await response.text();
      if (text) {
        parsedBody = JSON.parse(text);
      }
    } catch {
      // Non-JSON response — body stays null
    }
    return { response, body: parsedBody };
  }

  /**
   * Assert HTTP status code.
   *
   * @param {Response} response - Fetch response
   * @param {number} expected - Expected status code
   * @returns {Response}
   */
  assertStatus(response, expected) {
    return assertHttpStatus(response, expected);
  }

  /**
   * Assert response body contains required fields.
   *
   * @param {object} body - Response body
   * @param {string[] | object} requiredFields - Array of field names or {field: type} map
   * @returns {object}
   */
  assertBodyShape(body, requiredFields) {
    return assertBodyShape(body, requiredFields);
  }

  /**
   * Assert response body is an error with expected message.
   *
   * @param {object} body - Response body
   * @param {string|RegExp} expectedMessage - Expected error message or pattern
   * @returns {object}
   */
  assertError(body, expectedMessage) {
    if (!body || !body.error) {
      throw new Error(`Expected error response body, got: ${JSON.stringify(body)}`);
    }
    if (typeof expectedMessage === 'string') {
      if (!body.error.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to include "${expectedMessage}", got: "${body.error}"`
        );
      }
    } else if (expectedMessage instanceof RegExp) {
      if (!expectedMessage.test(body.error)) {
        throw new Error(`Expected error message to match ${expectedMessage}, got: "${body.error}"`);
      }
    }
    return body;
  }

  /**
   * Verify a database side effect — that a row exists with expected values.
   *
   * @param {string} table - Table name
   * @param {object} where - WHERE conditions
   * @param {object} expected - Expected column values
   * @returns {object} The matched row
   */
  verifySideEffect(table, where, expected) {
    return this.verifyDb(table, where, expected);
  }

  /**
   * Read and parse SSE events from a streaming response.
   *
   * Parses the SSE format:
   *   event: <type>\n
   *   data: <json>\n
   *   \n
   *
   * @param {Response} response - Fetch response with SSE stream
   * @param {object} [options]
   * @param {number} [options.timeoutMs] - Max time to wait for events (default: 10000)
   * @param {number} [options.maxEvents] - Max events to collect before returning (default: 50)
   * @returns {Promise<Array<{event: string, data: object}>>}
   */
  async readSSEEvents(response, options = {}) {
    const { timeoutMs = 10000, maxEvents = 50 } = options;
    const events = [];

    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const startTime = Date.now();

      while (events.length < maxEvents) {
        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
          break;
        }

        const { done, value } = await Promise.race([
          reader.read(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Read timeout')), timeoutMs)
          ),
        ]);

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse complete SSE messages from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent = 'message';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6).trim();
          } else if (line === '' && currentData) {
            // Empty line marks end of event
            try {
              events.push({
                event: currentEvent,
                data: JSON.parse(currentData),
              });
            } catch {
              events.push({
                event: currentEvent,
                data: currentData,
              });
            }
            currentEvent = 'message';
            currentData = '';
          }
        }

        // If we've collected enough events, stop
        if (events.length >= maxEvents) break;
      }
    } catch (err) {
      // Stream closed or timed out — return whatever we collected
      if (err.message !== 'Read timeout' && !err.message.includes('closed')) {
        // Non-timeout errors are acceptable in test env
      }
    }

    return events;
  }
}

module.exports = {
  ApiTestHarness,
  DEFAULT_BASE_URL,
  DEFAULT_SERVER_PROBE_PATH,
  getAgentHubBaseUrl,
  isAgentHubServerReachable,
  resetAgentHubServerReachabilityCache,
};
