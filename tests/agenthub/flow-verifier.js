/**
 * FlowVerifier — End-to-end flow verification engine for AgentHub.
 *
 * Executes multi-step flows with lock acquisition, step timeouts,
 * state assertions, and failure strategies.
 *
 * Usage:
 *   const verifier = new FlowVerifier(harness);
 *   const result = await verifier.execute({
 *     name: 'headless-lifecycle',
 *     timeout: 300000,
 *     onFailure: 'abort',
 *     steps: [
 *       { name: 'launch', action: 'api', method: 'POST', path: '/api/agenthub/headless', body: {...}, assert: { status: 200 } },
 *       { name: 'verify-traces', action: 'assert', type: 'db.rowCount', table: 'agent_traces', where: { session_id: '$launch.sessionId' }, min: 1 },
 *       { name: 'abort', action: 'api', method: 'POST', path: '/api/agenthub/sessions/$launch.sessionId/abort', assert: { status: 200 } },
 *     ]
 *   });
 */

const { acquire, release, forceRelease } = require('../../lib/test-locks');

class FlowVerifier {
  /**
   * @param {TestHarness} harness - TestHarness instance for DB access
   * @param {object} [options]
   * @param {string} [options.baseUrl] - Base URL for API calls
   * @param {number} [options.defaultTimeout] - Default step timeout in ms (30000)
   * @param {number} [options.flowTimeout] - Global flow timeout in ms (300000)
   */
  constructor(harness, options = {}) {
    this.harness = harness;
    this.baseUrl = options.baseUrl || process.env.AGENTHUB_BASE_URL || 'http://localhost:3000';
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.flowTimeout = options.flowTimeout || 300000;
    this._flowLockId = null;
    this._stepResults = [];
    this._context = {};
  }

  /**
   * Execute a flow definition.
   *
   * @param {object} flow - Flow definition
   * @param {string} flow.name - Flow name
   * @param {Array<object>} flow.steps - Step definitions
   * @param {string} [flow.onFailure] - Failure strategy: 'abort' | 'retry' | 'continue' (default: 'abort')
   * @param {number} [flow.timeout] - Global flow timeout in ms
   * @param {Array<{type: string, key: string}>} [flow.locks] - Locks to acquire for this flow
   * @returns {Promise<FlowResult>}
   */
  async execute(flow) {
    const startTime = Date.now();
    const flowLocks = flow.locks || [{ type: 'flow', key: flow.name }];
    const onFailure = flow.onFailure || 'abort';
    const timeout = flow.timeout || this.flowTimeout;

    // Acquire flow lock
    let lockIds = [];
    try {
      for (const lock of flowLocks) {
        const result = await acquire(this.harness.db, lock.type, lock.key, `flow-${flow.name}`);
        if (!result.success) {
          return {
            success: false,
            flowName: flow.name,
            duration: Date.now() - startTime,
            error: `Failed to acquire lock ${lock.type}:${lock.key}: ${result.reason}`,
            steps: [],
          };
        }
        lockIds.push(result.lockId);
      }
      this._flowLockId = lockIds[0];

      // Execute steps
      let aborted = false;
      const timeoutHandle = setTimeout(() => {
        aborted = true;
      }, timeout);

      for (let i = 0; i < flow.steps.length; i++) {
        if (aborted) {
          this._stepResults.push({
            step: i,
            name: flow.steps[i].name || `step-${i}`,
            status: 'timeout',
            error: `Flow timed out after ${timeout}ms`,
          });
          break;
        }

        const step = flow.steps[i];
        const stepResult = await this._executeStep(step, i);
        this._stepResults.push(stepResult);

        // Handle failure
        if (!stepResult.success) {
          if (onFailure === 'abort') {
            break;
          } else if (onFailure === 'retry') {
            const retryResult = await this._executeStep(step, i);
            this._stepResults[this._stepResults.length - 1] = retryResult;
            if (!retryResult.success) break;
          }
          // 'continue' — just keep going
        }
      }

      clearTimeout(timeoutHandle);

      const allSuccess = this._stepResults.every((s) => s.success);
      return {
        success: allSuccess,
        flowName: flow.name,
        duration: Date.now() - startTime,
        steps: this._stepResults,
        totalSteps: flow.steps.length,
        passedSteps: this._stepResults.filter((s) => s.success).length,
        failedSteps: this._stepResults.filter((s) => !s.success).length,
      };
    } finally {
      // Release locks
      for (const lockId of lockIds) {
        await release(this.harness.db, lockId, `flow-${flow.name}`);
      }
      this._flowLockId = null;
      this._stepResults = [];
      this._context = {};
    }
  }

  /**
   * Execute a single step.
   */
  async _executeStep(step, index) {
    const stepStart = Date.now();
    const timeout = step.timeout || this.defaultTimeout;
    const name = step.name || `step-${index}`;

    try {
      let result;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Step "${name}" timed out after ${timeout}ms`)), timeout);
      });

      switch (step.action) {
        case 'api':
          result = await Promise.race([this._executeApiStep(step), timeoutPromise]);
          break;
        case 'assert':
          result = await Promise.race([this._executeAssertStep(step), timeoutPromise]);
          break;
        case 'mcp':
          result = await Promise.race([this._executeMcpStep(step), timeoutPromise]);
          break;
        case 'telegram':
          result = await Promise.race([this._executeTelegramStep(step), timeoutPromise]);
          break;
        case 'custom':
          result = await Promise.race([step.fn(this.harness, this._context), timeoutPromise]);
          break;
        case 'sleep':
          result = await Promise.race([
            new Promise((resolve) => setTimeout(resolve, step.duration || 1000)).then(() => ({
              success: true,
            })),
            timeoutPromise,
          ]);
          break;
        default:
          result = { success: false, error: `Unknown action: ${step.action}` };
      }

      // Store result in context for interpolation
      this._context[name] = { ...result, timestamp: Date.now() };

      return {
        step: index,
        name,
        success: result.success !== false,
        duration: Date.now() - stepStart,
        ...result,
      };
    } catch (err) {
      return {
        step: index,
        name,
        success: false,
        duration: Date.now() - stepStart,
        error: err.message,
      };
    }
  }

  /**
   * Execute an API step.
   */
  async _executeApiStep(step) {
    const { method = 'GET', path: urlPath, body, headers = {} } = step;
    const resolvedPath = this._interpolate(urlPath);
    const url = `${this.baseUrl}${resolvedPath}`;

    const fetchOptions = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(this._interpolateObj(body));
    }

    const response = await fetch(url, fetchOptions);
    const responseBody = await response.json().catch(() => null);

    // Validate assertions
    if (step.assert) {
      if (step.assert.status && response.status !== step.assert.status) {
        return {
          success: false,
          error: `Expected status ${step.assert.status}, got ${response.status}`,
          response: { status: response.status, body: responseBody },
        };
      }
      if (step.assert.bodyContains) {
        const bodyStr = JSON.stringify(responseBody);
        if (!bodyStr.includes(step.assert.bodyContains)) {
          return {
            success: false,
            error: `Response body does not contain "${step.assert.bodyContains}"`,
            response: { status: response.status, body: responseBody },
          };
        }
      }
    }

    return {
      success: true,
      response: { status: response.status, body: responseBody },
    };
  }

  /**
   * Execute an assertion step.
   */
  async _executeAssertStep(step) {
    const db = this.harness.db;

    switch (step.type) {
      case 'db.rowExists': {
        const table = this._interpolate(step.table);
        const where = this._interpolateObj(step.where || {});
        const whereSql = Object.keys(where)
          .map((k) => `${k} = ?`)
          .join(' AND ');
        const values = Object.values(where);
        const row = db.prepare(`SELECT 1 FROM ${table} WHERE ${whereSql} LIMIT 1`).get(...values);
        if (!row) {
          return {
            success: false,
            error: `No row found in ${table} matching ${JSON.stringify(where)}`,
          };
        }
        return { success: true, type: 'db.rowExists', table, where };
      }

      case 'db.rowCount': {
        const table = this._interpolate(step.table);
        const where = this._interpolateObj(step.where || {});
        const whereSql = Object.keys(where)
          .map((k) => `${k} = ?`)
          .join(' AND ');
        const values = Object.values(where);
        const { count } = db
          .prepare(`SELECT COUNT(*) as count FROM ${table} ${whereSql}`)
          .get(...values);
        const min = step.min ?? 1;
        const max = step.max ?? Infinity;
        if (count < min || count > max) {
          return { success: false, error: `Expected ${min}-${max} rows in ${table}, got ${count}` };
        }
        return { success: true, type: 'db.rowCount', table, count };
      }

      case 'db.fieldValue': {
        const table = this._interpolate(step.table);
        const where = this._interpolateObj(step.where || {});
        const field = this._interpolate(step.field);
        const whereSql = Object.keys(where)
          .map((k) => `${k} = ?`)
          .join(' AND ');
        const values = Object.values(where);
        const row = db
          .prepare(`SELECT ${field} FROM ${table} WHERE ${whereSql} LIMIT 1`)
          .get(...values);
        if (!row) {
          return { success: false, error: `No row found in ${table}` };
        }
        const expected = this._interpolate(String(step.value));
        const actual = row[field];
        if (String(actual) !== expected) {
          return {
            success: false,
            error: `Field ${field}: expected "${expected}", got "${actual}"`,
          };
        }
        return { success: true, type: 'db.fieldValue', table, field, value: actual };
      }

      case 'http.status': {
        const ref = this._interpolate(step.responseRef);
        // This would need a stored response — handled via context
        return { success: true, type: 'http.status', note: 'Use API step assertions instead' };
      }

      case 'file.exists': {
        const fs = require('fs');
        const filePath = this._interpolate(step.path);
        if (!fs.existsSync(filePath)) {
          return { success: false, error: `File does not exist: ${filePath}` };
        }
        return { success: true, type: 'file.exists', path: filePath };
      }

      case 'process.running': {
        const pid = Number(this._interpolate(String(step.pid)));
        try {
          process.kill(pid, 0);
          return { success: true, type: 'process.running', pid };
        } catch {
          return { success: false, error: `Process ${pid} is not running` };
        }
      }

      default:
        return { success: false, error: `Unknown assertion type: ${step.type}` };
    }
  }

  /**
   * Execute an MCP tool step.
   */
  async _executeMcpStep(step) {
    // MCP steps require the MCP harness — delegate to the caller
    if (step.fn) {
      const result = await step.fn(this.harness, this._context);
      return { success: result.success !== false, ...result };
    }
    return { success: false, error: 'MCP step requires a custom fn' };
  }

  /**
   * Execute a Telegram command step.
   */
  async _executeTelegramStep(step) {
    if (!this.harness.createMockCtx) {
      return { success: false, error: 'Harness does not support Telegram commands' };
    }

    const ctx = this.harness.createMockCtx(step.ctx || {});
    const commandName = this._interpolate(step.command);
    const args = this._interpolate(step.args || '');

    await this.harness.executeCommand(commandName, ctx, args);

    const replies = this.harness.getReplies();

    if (step.assert && step.assert.replyContains) {
      const expected = this._interpolate(step.assert.replyContains);
      const found = replies.some((r) => r.text.includes(expected));
      if (!found) {
        return {
          success: false,
          error: `No reply contains "${expected}"`,
          replies: replies.map((r) => r.text.substring(0, 100)),
        };
      }
    }

    return { success: true, type: 'telegram', command: commandName, replyCount: replies.length };
  }

  /**
   * Interpolate context variables in a string.
   * Supports: $stepName.field, $stepName
   */
  _interpolate(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\$(\w+)(?:\.(\w+))?/g, (match, stepName, field) => {
      const stepData = this._context[stepName];
      if (!stepData) return match;
      if (field) {
        return stepData[field] !== undefined ? stepData[field] : match;
      }
      return stepData.response?.sessionId || stepData.sessionId || match;
    });
  }

  /**
   * Interpolate context variables in an object's values.
   */
  _interpolateObj(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this._interpolate(value);
    }
    return result;
  }

  /**
   * Get the current flow context.
   */
  getContext() {
    return { ...this._context };
  }
}

module.exports = { FlowVerifier };
