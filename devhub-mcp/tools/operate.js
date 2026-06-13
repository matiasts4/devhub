'use strict';

/**
 * devhub-mcp/tools/operate.js
 *
 * MCP tool: devhub_operate — routes a tool call through the operator action contract.
 *
 * When a DevHub surface calls an MCP tool via the operator contract path,
 * it uses devhub_operate instead of calling the tool directly.
 * The tool checks action_id against the policy engine before executing.
 *
 * This replaces the x-dh-action-id header approach (not available in stdio MCP).
 * The devhub-mcp server runs in the same process as DevHub's Next.js,
 * so we can import the adapter-boundary directly.
 */

import { z } from 'zod';

const OPERATE_TOOL_SCHEMA = z.object({
  action_id: z.string().describe('Canonical operator action id'),
  params: z.record(z.any()).optional().describe('Action parameters'),
  target: z
    .object({
      type: z.string(),
      id: z.string(),
      label: z.string().optional(),
    })
    .optional()
    .describe('Target resource'),
  actor_role: z.enum(['obs', 'op', 'dir', 'sys']).optional().describe('Actor role. Default: sys'),
});

export function registerOperateTools(server, deps) {
  const { ok, err, randomUUID } = deps;

  /**
   * devhub_operate — execute an operator action via the action contract.
   *
   * This tool is the integration point between the MCP surface and the
   * operator action contract. Instead of calling raw MCP tools directly,
   * DevHub surfaces use this tool to get policy enforcement + audit trail.
   */
  server.tool(
    'devhub_operate',
    'Execute a DevHub operator action with policy enforcement and audit. Use this instead of direct tool calls for state-changing operations.',
    {
      action_id: z.string().describe('Canonical action id (e.g. "mut_session_name", "orch_spawn_agent")'),
      params: z.record(z.any()).optional().describe('Action parameters'),
      target: z
        .object({
          type: z.string(),
          id: z.string(),
          label: z.string().optional(),
        })
        .optional()
        .describe('Target resource'),
      actor_role: z.enum(['obs', 'op', 'dir', 'sys']).optional().describe('Actor role. Default: sys'),
    },
    async ({ action_id, params = {}, target = null, actor_role = 'sys' }) => {
      try {
        // Use the adapter-boundary directly (same process, no network hop)
        const { executeAction } = await import(
          '../../../src/lib/operations/adapter-boundary.js'
        ).catch(() => ({ executeAction: null }));

        // Fallback: if adapter-boundary not available, check via routeDispatch
        if (!executeAction) {
          const { routeDispatch } = await import(
            '../../../src/lib/operations/intent-router.js'
          ).catch(() => ({ routeDispatch: null }));

          if (!routeDispatch) {
            return err('operator-action-contract not initialized: adapter-boundary unavailable');
          }

          const result = routeDispatch({
            action_id,
            params,
            target,
            actor_role,
            actor_session_id: `mcp-${randomUUID()}`,
            confirmation: actor_role === 'sys' ? { confirmed: true } : null,
          });

          if (result.status === 'PROCEED') {
            return ok({ status: 'PROCEED', action_id, note: 'action allowed (no executor wired yet)' });
          }
          if (result.status === 'CONFIRM_REQUIRED') {
            return err(`CONFIRM_REQUIRED: action "${action_id}" requires confirmation for role "${actor_role}"`);
          }
          return err(`POLICY_DENIED: ${result.error_detail}`);
        }

        const result = await executeAction({
          action_id,
          params,
          target,
          actor_role,
          actor_session_id: `mcp-${randomUUID()}`,
          confirmation: actor_role === 'sys' ? { confirmed: true } : null,
        });

        if (result.uiOnly) {
          return ok({ status: 'PROCEED', action_id, uiOnly: true });
        }

        if (!result.ok) {
          return err(`action error: ${result.error}`);
        }

        return ok({ status: 'PROCEED', result: result.result });
      } catch (err_) {
        return err(`devhub_operate failed: ${err_.message}`);
      }
    }
  );

  /**
   * devhub_list_actions — list available operator actions (excludes Tier 4).
   * This replaces GET /api/operator/actions for MCP surfaces.
   */
  server.tool(
    'devhub_list_actions',
    'List all available DevHub operator actions (excludes Tier 4 critical actions). Use to discover available actions.',
    {},
    async () => {
      try {
        const { ACTION_REGISTRY } = await import(
          '../../../src/lib/operations/action-registry.js'
        ).catch(() => ({ ACTION_REGISTRY: {} }));

        if (!ACTION_REGISTRY || typeof ACTION_REGISTRY !== 'object') {
          return err('action-registry not available');
        }

        const actions = Object.entries(ACTION_REGISTRY)
          .filter(([, def]) => def.tier < 4)
          .map(([action_id, def]) => ({
            action_id,
            class: def.class,
            tier: def.tier,
            label: def.label,
          }));

        return ok({ actions });
      } catch (err_) {
        return err(`devhub_list_actions failed: ${err_.message}`);
      }
    }
  );
}