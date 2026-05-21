/**
 * Assertion Utilities for AgentHub Testing
 *
 * Provides standardized assertion helpers for:
 * - Database state verification
 * - HTTP response validation
 * - File system checks
 * - Process monitoring
 */

const fs = require('fs');
const path = require('path');

/**
 * Assert that a database row matches expected values.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {string} table - Table name
 * @param {object} where - WHERE conditions (key-value pairs)
 * @param {object} expected - Expected column values to verify
 * @throws {Error} If row not found or values don't match
 */
function assertDbRow(db, table, where, expected) {
  const whereClauses = Object.keys(where).map((key) => `${key} = ?`);
  const whereValues = Object.values(where);
  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const row = db.prepare(`SELECT * FROM ${table} ${whereSql}`).get(...whereValues);

  if (!row) {
    const conditions = Object.entries(where)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    throw new Error(`Row not found in ${table}: ${conditions || '(no conditions)'}`);
  }

  const mismatches = [];
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = row[key];
    // Handle JSON string comparison
    if (typeof expectedValue === 'object' && expectedValue !== null) {
      const actualParsed = typeof actual === 'string' ? JSON.parse(actual) : actual;
      if (JSON.stringify(actualParsed) !== JSON.stringify(expectedValue)) {
        mismatches.push({
          key,
          expected: expectedValue,
          actual: actualParsed,
        });
      }
    } else if (actual !== expectedValue) {
      mismatches.push({ key, expected: expectedValue, actual });
    }
  }

  if (mismatches.length > 0) {
    const details = mismatches
      .map(
        (m) => `  ${m.key}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.actual)}`
      )
      .join('\n');
    throw new Error(`Row assertion failed in ${table}:\n${details}`);
  }

  return row;
}

/**
 * Assert that the row count in a table falls within a range.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {string} table - Table name
 * @param {object} [where] - Optional WHERE conditions
 * @param {number} min - Minimum expected count (inclusive)
 * @param {number} [max] - Maximum expected count (inclusive, default: min)
 * @throws {Error} If count is outside the range
 */
function assertDbRowCount(db, table, where, min, max) {
  // Handle overload: assertDbRowCount(db, table, min, max)
  if (typeof where === 'number') {
    max = min;
    min = where;
    where = null;
  }

  max = max ?? min;

  let whereSql = '';
  const params = [];
  if (where && Object.keys(where).length > 0) {
    const clauses = Object.keys(where).map((key) => `${key} = ?`);
    whereSql = `WHERE ${clauses.join(' AND ')}`;
    params.push(...Object.values(where));
  }

  const { count } = db.prepare(`SELECT COUNT(*) as count FROM ${table} ${whereSql}`).get(...params);

  if (count < min || count > max) {
    throw new Error(`Row count assertion failed in ${table}: expected ${min}-${max}, got ${count}`);
  }

  return count;
}

/**
 * Assert that a specific field in a database row has an expected value.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {string} table - Table name
 * @param {object} where - WHERE conditions
 * @param {string} field - Field name to check
 * @param {*} value - Expected value
 * @throws {Error} If row not found or field value doesn't match
 */
function assertDbFieldValue(db, table, where, field, value) {
  const whereClauses = Object.keys(where).map((key) => `${key} = ?`);
  const whereValues = Object.values(where);
  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const row = db.prepare(`SELECT ${field} FROM ${table} ${whereSql}`).get(...whereValues);

  if (!row) {
    const conditions = Object.entries(where)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    throw new Error(
      `Row not found in ${table} for field check: ${conditions || '(no conditions)'}`
    );
  }

  const actual = row[field];

  // Handle JSON comparison for text fields
  if (typeof value === 'object' && value !== null && typeof actual === 'string') {
    try {
      const parsed = JSON.parse(actual);
      if (JSON.stringify(parsed) !== JSON.stringify(value)) {
        throw new Error(
          `Field value mismatch in ${table}.${field}: expected ${JSON.stringify(value)}, got ${actual}`
        );
      }
      return actual;
    } catch (e) {
      if (e.message.startsWith('Field value mismatch')) throw e;
      // Not valid JSON, fall through to direct comparison
    }
  }

  if (actual !== value) {
    throw new Error(
      `Field value mismatch in ${table}.${field}: expected ${JSON.stringify(value)}, got ${JSON.stringify(actual)}`
    );
  }

  return actual;
}

/**
 * Assert that an HTTP response has the expected status code.
 *
 * @param {object} response - HTTP response object (from fetch, supertest, etc.)
 * @param {number} expected - Expected HTTP status code
 * @throws {Error} If status doesn't match
 */
function assertHttpStatus(response, expected) {
  const actual = response.status ?? response.statusCode;
  if (actual !== expected) {
    throw new Error(
      `HTTP status mismatch: expected ${expected}, got ${actual}${response.statusText ? ` (${response.statusText})` : ''}`
    );
  }
  return response;
}

/**
 * Assert that a response body contains all required fields.
 *
 * @param {object} body - Response body object
 * @param {string[] | object} requiredFields - Array of field names OR object with field: type pairs
 * @throws {Error} If any required field is missing or wrong type
 */
function assertBodyShape(body, requiredFields) {
  if (!body || typeof body !== 'object') {
    throw new Error(`Expected body to be an object, got ${typeof body}`);
  }

  if (Array.isArray(requiredFields)) {
    const missing = requiredFields.filter((field) => !(field in body));
    if (missing.length > 0) {
      throw new Error(`Missing required fields in body: ${missing.join(', ')}`);
    }
  } else if (typeof requiredFields === 'object') {
    const errors = [];
    for (const [field, expectedType] of Object.entries(requiredFields)) {
      if (!(field in body)) {
        errors.push(`Missing field: ${field}`);
      } else if (expectedType && typeof body[field] !== expectedType) {
        errors.push(
          `Field "${field}" expected type "${expectedType}", got "${typeof body[field]}"`
        );
      }
    }
    if (errors.length > 0) {
      throw new Error(`Body shape assertion failed:\n  ${errors.join('\n  ')}`);
    }
  }

  return body;
}

/**
 * Assert that a trace exists in the database for a given session.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {string} sessionId - Session ID to search
 * @param {object} [options]
 * @param {string} [options.traceType] - Filter by trace type
 * @param {string} [options.toolName] - Filter by tool name
 * @param {string} [options.toolStatus] - Filter by tool status
 * @param {string} [options.messageId] - Filter by message ID
 * @param {number} [options.minCount] - Minimum number of traces expected (default: 1)
 * @param {number} [options.maxCount] - Maximum number of traces expected
 * @throws {Error} If trace criteria not met
 */
function assertTraceExists(db, sessionId, options = {}) {
  const { traceType, toolName, toolStatus, messageId, minCount = 1, maxCount } = options;

  let query = 'SELECT COUNT(*) as count FROM agent_traces WHERE session_id = ?';
  const params = [sessionId];

  if (traceType) {
    query += ' AND trace_type = ?';
    params.push(traceType);
  }
  if (toolName) {
    query += ' AND tool_name = ?';
    params.push(toolName);
  }
  if (toolStatus) {
    query += ' AND tool_status = ?';
    params.push(toolStatus);
  }
  if (messageId) {
    query += ' AND message_id = ?';
    params.push(messageId);
  }

  const { count } = db.prepare(query).get(...params);

  if (count < minCount) {
    const desc = [
      `session_id=${sessionId}`,
      traceType && `trace_type=${traceType}`,
      toolName && `tool_name=${toolName}`,
      toolStatus && `tool_status=${toolStatus}`,
      messageId && `message_id=${messageId}`,
    ]
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Trace assertion failed: expected at least ${minCount} trace(s) matching [${desc}], found ${count}`
    );
  }

  if (maxCount !== undefined && count > maxCount) {
    throw new Error(
      `Trace assertion failed: expected at most ${maxCount} trace(s), found ${count}`
    );
  }

  return count;
}

/**
 * Assert that a file exists at the given path.
 *
 * @param {string} filePath - Path to the file
 * @param {object} [options]
 * @param {boolean} [options.shouldExist] - Whether the file should exist (default: true)
 * @param {string} [options.contains] - Assert file contains this string
 * @throws {Error} If file doesn't exist (or exists when it shouldn't)
 */
function assertFileExists(filePath, options = {}) {
  const { shouldExist = true, contains } = options;
  const resolvedPath = path.resolve(filePath);
  const exists = fs.existsSync(resolvedPath);

  if (shouldExist && !exists) {
    throw new Error(`File does not exist: ${resolvedPath}`);
  }

  if (!shouldExist && exists) {
    throw new Error(`File should not exist but does: ${resolvedPath}`);
  }

  if (exists && contains !== undefined) {
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    if (!content.includes(contains)) {
      throw new Error(`File ${resolvedPath} does not contain expected string: "${contains}"`);
    }
  }

  return exists;
}

/**
 * Assert that a process with the given PID is running.
 *
 * @param {number|string} pid - Process ID
 * @throws {Error} If process is not running
 */
function assertProcessRunning(pid) {
  try {
    // process.kill with signal 0 checks if the process exists without sending a signal
    process.kill(Number(pid), 0);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') {
      throw new Error(`Process with PID ${pid} is not running`);
    }
    if (err.code === 'EPERM') {
      // Process exists but we don't have permission to signal it
      return true;
    }
    throw err;
  }
}

module.exports = {
  assertDbRow,
  assertDbRowCount,
  assertDbFieldValue,
  assertHttpStatus,
  assertBodyShape,
  assertTraceExists,
  assertFileExists,
  assertProcessRunning,
};
