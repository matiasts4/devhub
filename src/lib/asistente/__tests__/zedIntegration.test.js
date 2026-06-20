/**
 * @jest-environment jsdom
 */

import { resolveZedIntent } from '../zedIntentRouter';
import { formatZedFastPathReply } from '../zedFastPathResponse';
import { ToolRegistry } from '../tools/registry';
import { terminalTool } from '../tools/terminal';

describe('Zed integration: intent → fast path → reply', () => {
  test('list terminals intent produces readable reply', () => {
    const intent = resolveZedIntent('¿Qué terminales hay?', {
      workspace_terminals: [],
      terminal_panel_count: 0,
    });

    expect(intent.tier).toBe('local-high');
    expect(intent.steps[0].tool).toBe('list_terminals');

    const reply = formatZedFastPathReply('list_terminals', { processes: [] });
    expect(reply).toBe('No hay terminales abiertas.');
  });

  test('open terminal intent can be executed by registry', async () => {
    const registry = new ToolRegistry();
    const captured = [];
    registry.register({
      ...terminalTool,
      execute: async (input) => {
        captured.push(input);
        return { opened: true, terminalId: 't1', displayName: 'Panel-A' };
      },
    });

    const result = await registry.execute('open_terminal', { program: 'node' }, {});
    expect(result.opened).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].program).toBe('node');

    const reply = formatZedFastPathReply('open_terminal', result);
    expect(reply).toContain('Panel-A');
  });
});
