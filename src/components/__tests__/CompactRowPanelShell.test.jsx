/**
 * Unit tests for CompactRow and CompactPanelShell — swarm-control-v2-redesign
 *
 * Strict TDD: tests written BEFORE implementation.
 * Tests use the project's domHarness for React component rendering.
 */

const React = require('react');
const { installDom, renderIntoDom, cleanupMountedRoots } = require('@/test-support/domHarness');

const mountedRoots = [];

beforeEach(() => {
  installDom();
});

afterEach(() => {
  cleanupMountedRoots(mountedRoots);
});

// ─── CompactRow ──────────────────────────────────────────────────────────────

describe('CompactRow', () => {
  let CompactRow;

  beforeEach(() => {
    // Require fresh — will fail until implementation exists (RED gate)
    jest.resetModules();
    ({ CompactRow } = require('@/components/control-room/utils'));
  });

  test('renders status pill with the given status', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, { status: 'active', primary: 'agent-001' }),
      mountedRoots
    );

    // StatusPill renders a span with the status label text
    expect(container.textContent).toContain('activo');
  });

  test('renders primary text truncated', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'running',
        primary: 'a-very-long-agent-id-that-should-be-truncated-for-display',
      }),
      mountedRoots
    );

    const primaryEl = container.querySelector('[data-testid="compact-row-primary"]');
    expect(primaryEl).toBeTruthy();
    // truncateId should shorten IDs > 22 chars (8 + … + 5)
    expect(primaryEl.textContent).toBe('a-very-l…splay');
  });

  test('renders secondary text when provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'pending',
        primary: 'task-123',
        secondary: 'Fix auth middleware',
      }),
      mountedRoots
    );

    const secondaryEl = container.querySelector('[data-testid="compact-row-secondary"]');
    expect(secondaryEl).toBeTruthy();
    expect(secondaryEl.textContent).toBe('Fix auth middleware');
  });

  test('does not render secondary text when not provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'idle',
        primary: 'task-456',
      }),
      mountedRoots
    );

    const secondaryEl = container.querySelector('[data-testid="compact-row-secondary"]');
    expect(secondaryEl).toBeFalsy();
  });

  test('renders badge count when provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'failed',
        primary: 'run-abc',
        badge: 3,
      }),
      mountedRoots
    );

    const badge = container.querySelector('[data-testid="compact-row-badge"]');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('3');
  });

  test('does not render badge when not provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'succeeded',
        primary: 'run-def',
      }),
      mountedRoots
    );

    const badge = container.querySelector('[data-testid="compact-row-badge"]');
    expect(badge).toBeFalsy();
  });

  test('renders timestamp via formatRelativeTime when provided', async () => {
    const now = Date.now();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();

    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'completed',
        primary: 'run-old',
        timestamp: fiveMinAgo,
      }),
      mountedRoots
    );

    const timeEl = container.querySelector('[data-testid="compact-row-timestamp"]');
    expect(timeEl).toBeTruthy();
    expect(timeEl.textContent).toMatch(/5m ago/);
  });

  test('renders without optional props — minimal row', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'unknown',
        primary: 'minimal',
      }),
      mountedRoots
    );

    // Row container should exist
    const row = container.querySelector('[data-testid="compact-row"]');
    expect(row).toBeTruthy();
    // Should have the status pill
    expect(container.textContent).toContain('desconocido');
    expect(container.textContent).toContain('minimal');
  });

  test('renders custom icon when provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'active',
        primary: 'with-icon',
        icon: React.createElement('span', { 'data-testid': 'custom-icon' }, '★'),
      }),
      mountedRoots
    );

    const icon = container.querySelector('[data-testid="custom-icon"]');
    expect(icon).toBeTruthy();
    expect(icon.textContent).toBe('★');
  });

  // ─── Triangulation: edge cases ─────────────────────────────────────────

  test('handles null/undefined primary gracefully', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'idle',
        primary: null,
      }),
      mountedRoots
    );

    const primaryEl = container.querySelector('[data-testid="compact-row-primary"]');
    expect(primaryEl).toBeTruthy();
    expect(primaryEl.textContent).toBe('—');
  });

  test('handles empty string primary', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'idle',
        primary: '',
      }),
      mountedRoots
    );

    const primaryEl = container.querySelector('[data-testid="compact-row-primary"]');
    expect(primaryEl.textContent).toBe('—');
  });

  test('short primary text is not truncated', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'active',
        primary: 'short',
      }),
      mountedRoots
    );

    const primaryEl = container.querySelector('[data-testid="compact-row-primary"]');
    expect(primaryEl.textContent).toBe('short');
  });

  test('badge renders 0 when explicitly set to 0', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'active',
        primary: 'test',
        badge: 0,
      }),
      mountedRoots
    );

    const badge = container.querySelector('[data-testid="compact-row-badge"]');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('0');
  });

  test('timestamp falls back to last 8 chars for invalid short date', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'active',
        primary: 'test',
        timestamp: 'not-a-date',
      }),
      mountedRoots
    );

    const timeEl = container.querySelector('[data-testid="compact-row-timestamp"]');
    expect(timeEl).toBeTruthy();
    // formatRelativeTime returns last 8 chars for non-ISO strings > 8 chars
    expect(timeEl.textContent).toBe('t-a-date');
  });

  test('unknown status falls back to raw label with underscores replaced', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactRow, {
        status: 'some_weird_status',
        primary: 'test',
      }),
      mountedRoots
    );

    // formatToken replaces underscores with spaces for unknown statuses
    expect(container.textContent).toContain('some weird status');
  });
});

// ─── CompactPanelShell ───────────────────────────────────────────────────────

describe('CompactPanelShell', () => {
  let CompactPanelShell;

  beforeEach(() => {
    jest.resetModules();
    ({ CompactPanelShell } = require('@/components/control-room/utils'));
  });

  test('renders title in header', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'Agents',
        items: [],
        renderItem: () => null,
      }),
      mountedRoots
    );

    const header = container.querySelector('h2');
    expect(header).toBeTruthy();
    expect(header.textContent).toBe('Agents');
  });

  test('shows empty state "Sin datos" when items array is empty', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'Workspaces',
        items: [],
        renderItem: () => null,
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Sin datos');
  });

  test('shows custom empty message when provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'Queue',
        items: [],
        renderItem: () => null,
        emptyMessage: 'No hay tareas en cola',
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('No hay tareas en cola');
    expect(container.textContent).not.toContain('Sin datos');
  });

  test('renders items using renderItem callback', async () => {
    const items = [
      { id: 'a', name: 'Agent A' },
      { id: 'b', name: 'Agent B' },
    ];

    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'Agents',
        items,
        renderItem: (item) =>
          React.createElement('div', { 'data-testid': 'agent-row', key: item.id }, item.name),
      }),
      mountedRoots
    );

    const rows = container.querySelectorAll('[data-testid="agent-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toBe('Agent A');
    expect(rows[1].textContent).toBe('Agent B');
  });

  test('renders CountBadge when count prop is provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'Runs',
        items: [{ id: '1' }],
        renderItem: () => null,
        count: 5,
      }),
      mountedRoots
    );

    // CountBadge renders the number
    expect(container.textContent).toContain('5');
  });

  test('respects maxHeight style on body container', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'Tall Panel',
        items: [{ id: '1' }],
        renderItem: () => null,
        maxHeight: '200px',
      }),
      mountedRoots
    );

    const body = container.querySelector('[data-testid="compact-panel-body"]');
    expect(body).toBeTruthy();
    expect(body.style.maxHeight).toBe('200px');
    expect(body.style.overflowY).toBe('auto');
  });

  test('uses default maxHeight of 300px when not specified', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'Default Panel',
        items: [{ id: '1' }],
        renderItem: () => null,
      }),
      mountedRoots
    );

    const body = container.querySelector('[data-testid="compact-panel-body"]');
    expect(body.style.maxHeight).toBe('300px');
  });

  test('renders headerExtra content when provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'Approvals',
        items: [],
        renderItem: () => null,
        headerExtra: React.createElement('span', { 'data-testid': 'authority-pill' }, 'Canónica'),
      }),
      mountedRoots
    );

    const extra = container.querySelector('[data-testid="authority-pill"]');
    expect(extra).toBeTruthy();
    expect(extra.textContent).toBe('Canónica');
  });

  test('scrollable body does not overflow to page level', async () => {
    // Generate 20 items to force overflow
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `item-${i}` }));

    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'Overflow Test',
        items,
        renderItem: (item) =>
          React.createElement('div', { key: item.id, style: { height: '30px' } }, item.id),
        maxHeight: '100px',
      }),
      mountedRoots
    );

    const body = container.querySelector('[data-testid="compact-panel-body"]');
    expect(body.style.maxHeight).toBe('100px');
    expect(body.style.overflowY).toBe('auto');
    // All 20 items should be rendered inside the body
    const children = body.querySelectorAll('div');
    expect(children).toHaveLength(20);
  });

  // ─── Triangulation: edge cases ─────────────────────────────────────────

  test('handles null items array gracefully', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'Null Items',
        items: null,
        renderItem: () => null,
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Sin datos');
  });

  test('renders description when provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'With Description',
        description: 'Showing active agents',
        items: [],
        renderItem: () => null,
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Showing active agents');
  });

  test('uses title as aria-label when ariaLabel not provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'My Panel',
        items: [],
        renderItem: () => null,
      }),
      mountedRoots
    );

    const section = container.querySelector('section');
    expect(section.getAttribute('aria-label')).toBe('My Panel');
  });

  test('uses custom ariaLabel when provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'My Panel',
        ariaLabel: 'Custom accessibility label',
        items: [],
        renderItem: () => null,
      }),
      mountedRoots
    );

    const section = container.querySelector('section');
    expect(section.getAttribute('aria-label')).toBe('Custom accessibility label');
  });

  test('CountBadge does not render when count is 0', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CompactPanelShell, {
        title: 'Zero Count',
        items: [{ id: '1' }],
        renderItem: () => null,
        count: 0,
      }),
      mountedRoots
    );

    // CountBadge returns null for falsy count, so "0" should not appear
    // The body has the item "1" but no "0" badge
    const bodyText = container.querySelector('[data-testid="compact-panel-body"]').textContent;
    expect(bodyText).not.toContain('0');
  });
});
