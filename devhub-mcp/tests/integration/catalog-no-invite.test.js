/**
 * Catalog no-invite test.
 *
 * Enumerates the tool names registered by the MCP server and asserts
 * that none of them matches `*invite*` or `*accept_invite*`. The MCP
 * invitation flow is web-only (CAP-8 / REQ-INV-6); exposing it on MCP
 * would be a security regression. The test fails the build if any
 * such tool name is added.
 *
 * Refs: REQ-MEM-7.
 */

import { describe, it, expect } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

const FORBIDDEN_PATTERNS = [/invite/i, /accept_invite/i, /acceptInvite/i];

describe('MCP catalog: no invite / accept_invite tools', () => {
  it('does not register any *invite* or *accept_invite* tool', async () => {
    const harness = await createTestHarness();
    await harness.initialize();
    try {
      const tools = await harness.listTools();
      const offenders = [];
      for (const tool of tools) {
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(tool.name)) {
            offenders.push(tool.name);
          }
        }
      }
      expect(offenders).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });
});
