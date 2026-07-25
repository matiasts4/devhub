const React = require('react');
const {
  installDom,
  renderIntoDom,
  cleanupMountedRoots,
  click,
} = require('@/test-support/domHarness');

const DiagnosticOverlay = require('../control-room/DiagnosticOverlay').default;

const mountedRoots = [];

async function renderOverlay(props = {}) {
  return renderIntoDom(
    React.createElement(DiagnosticOverlay, {
      expanded: true,
      onToggle: jest.fn(),
      diagnostics: {},
      ...props,
    }),
    mountedRoots
  );
}

describe('DiagnosticOverlay runtime evidence actions', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    jest.clearAllMocks();
  });

  test('renders runtime evidence action buttons for log and crashdump refs', async () => {
    const view = await renderOverlay({
      diagnostics: {
        telegram: {
          status: 'healthy',
          authority: 'authoritative',
          freshness: 'current',
          evidence_ref: 'evidence://telegram/status',
        },
        runtime: {
          status: 'degraded',
          authority: 'authoritative',
          freshness: 'current',
          evidence_refs: [
            'log://terminal-debug.log:data/logs/terminal-debug.log',
            'crashdump://dump-1.json:data/logs/crash-dumps/dump-1.json',
          ],
        },
      },
    });

    const section = view.container.querySelector('[aria-label="Overlay diagnóstico"]');
    const runtimeActions = section?.querySelector('[aria-label="Runtime evidence actions"]');

    expect(section?.textContent).toContain('Runtime');
    expect(runtimeActions).not.toBeNull();
    expect(runtimeActions?.textContent).toContain('Log: terminal-debug.log');
    expect(runtimeActions?.textContent).toContain('Crash: dump-1.json');
  });

  test('renders runtime restore summary and supports copy/export actions', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    global.navigator = {
      clipboard: { writeText },
    };

    const view = await renderOverlay({
      diagnostics: {
        runtime: {
          status: 'degraded',
          authority: 'authoritative',
          freshness: 'current',
          metrics: {
            reattachable_terminals: 2,
            orphaned_processes: 1,
            stale_registry_agents: 1,
            quota_blocked: true,
            total_terminals: 4,
            total_processes: 4,
            total_registry_agents: 3,
          },
          evidence_refs: ['log://terminal-debug.log:data/logs/terminal-debug.log'],
        },
      },
    });

    const section = view.container.querySelector('[aria-label="Overlay diagnóstico"]');
    const restoreSummary = section?.querySelector('[aria-label="Runtime restore summary"]');

    expect(restoreSummary).not.toBeNull();
    expect(restoreSummary?.textContent).toContain('Reattachables: 2');
    expect(restoreSummary?.textContent).toContain('Orphaned: 1');
    expect(restoreSummary?.textContent).toContain('Registro vencido: 1');
    expect(restoreSummary?.textContent).toContain('Cuota: bloqueada');

    const summaryButton = Array.from(restoreSummary?.querySelectorAll('button') || []).find(
      (button) => button.textContent.includes('Copiar resumen runtime')
    );
    const exportButton = Array.from(restoreSummary?.querySelectorAll('button') || []).find(
      (button) => button.textContent.includes('Exportar runtime JSON')
    );

    await click(summaryButton);
    await click(exportButton);

    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText.mock.calls[0][0]).toContain('quota_blocked=true');
    expect(writeText.mock.calls[1][0]).toContain('"reattachable_terminals": 2');
  });
});
