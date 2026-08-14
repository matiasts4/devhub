const React = require('react');
const {
  cleanupMountedRoots,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');

const mountedRoots = [];
let dom;
let dateNowSpy;

beforeEach(() => {
  dom = installDom();
  // Anchor wall-clock so the module-level synced delay is deterministic. The
  // stability assertion below advances Date.now between renders; a per-render
  // syncedDelay() would track it, a module constant would not.
  dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
});

afterEach(() => {
  cleanupMountedRoots(mountedRoots);
  dateNowSpy.mockRestore();
  dom = null;
});

function haloDelay(container) {
  const halo = container.querySelector('.agent-dot-halo');
  return halo ? halo.style.animationDelay : null;
}

describe('AgentStatusDot animation-delay stability', () => {
  it('keeps a stable halo animationDelay across re-renders as the clock advances', async () => {
    // Require AFTER mocking Date.now so any module-level constant is anchored.
    jest.resetModules();
    const AgentStatusDot = require('../AgentStatusDot').default;
    const { PANEL_STATUS } = require('@/components/terminal/utils/panelStatusHelpers');

    const { container, rerender } = await renderIntoDom(
      React.createElement(AgentStatusDot, { status: PANEL_STATUS.RUNNING, halo: true }),
      mountedRoots
    );

    const firstDelay = haloDelay(container);
    expect(firstDelay).toBeTruthy();

    // Advance the clock well past one period boundary.
    dateNowSpy.mockReturnValue(1_000_000 + 5_000);

    await rerender(
      React.createElement(AgentStatusDot, { status: PANEL_STATUS.RUNNING, halo: true })
    );

    const secondDelay = haloDelay(container);
    expect(secondDelay).toBe(firstDelay);
  });
});
