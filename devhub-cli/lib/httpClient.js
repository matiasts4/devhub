'use strict';

/**
 * HTTP client with HMAC auth support for DevHub CLI.
 */

const { readAuthFile, signRequest } = require('./auth');

/**
 * Make an HTTP request with optional HMAC signing.
 * @param {object} options
 * @param {string} options.url - Full URL (e.g., http://localhost:3000/api/...)
 * @param {string} [options.method='GET'] - HTTP method
 * @param {object} [options.body] - Request body (will be JSON-serialized)
 * @param {boolean} [options.signed=false] - Whether to sign the request
 * @param {object} [options.headers={}] - Additional headers
 * @returns {Promise<object>} { status, data, error }
 */
async function request({ url, method = 'GET', body, signed = false, headers = {} }) {
  const timestamp = new Date().toISOString();
  const bodyString = body ? JSON.stringify(body) : '';

  // Add auth headers if signed
  if (signed) {
    const auth = readAuthFile();
    if (!auth) {
      throw new Error('Not authenticated. Run `devhub auth login` first.');
    }
    const signature = signRequest(auth.secret, timestamp, bodyString);
    headers['X-Agent-Id'] = auth.agent_id;
    headers['X-Agent-Timestamp'] = timestamp;
    headers['X-Agent-Signature'] = signature;
  }

  // Set Content-Type for POST/PUT
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: bodyString || undefined,
    });

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text ? { message: text } : {};
    }

    if (response.status >= 400) {
      return {
        status: response.status,
        error: data.error || data.message || `HTTP ${response.status}`,
        data,
      };
    }

    return {
      status: response.status,
      data,
    };
  } catch (err) {
    throw new Error(`Request failed: ${err.message}`);
  }
}

module.exports = { request };
