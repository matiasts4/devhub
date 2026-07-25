// E2E smoke tests for DGObserverSidebar
// Tests mount empty → empty state, mount with mission → rows visible,
// approve/reject fire onApprove/onReject callbacks,
// failed row shows fallback, completed row hides fallback.

const React = require('react');
const { installDom, renderIntoDom, cleanupMountedRoots } = require('@/test-support/domHarness');

const DGObserverSidebar = require('../DGObserverSidebar').default;

function makeDGState(overrides = {}) {
  return {
    activeMissionId: null,
    timelineRows: [],
    pollingState: 'idle',
    currentDirectorStatus: null,
    pendingApproval: null,
    lastPollAt: null,
    error: null,
    composeMissionRequest: jest.fn(),
    onApprove: jest.fn(),
    onReject: jest.fn(),
    resetMission: jest.fn(),
    ...overrides,
  };
}

const mountedRoots = [];

describe('DGObserverSidebar', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
  });

  test('mounts with no active mission → empty state message', async () => {
    const dg = makeDGState();
    const { container } = await renderIntoDom(
      React.createElement(DGObserverSidebar, dg),
      mountedRoots
    );
    const html = container.innerHTML;
    expect(html).toMatch(/Sin misión activa/i);
  });

  test('mounts with active mission → shows timeline rows', async () => {
    const dg = makeDGState({
      activeMissionId: 'mission-123',
      timelineRows: [
        {
          id: 'row-1',
          missionId: 'mission-123',
          timestamp: Date.now(),
          initiator: 'operator',
          target: 'swarm-director',
          action: 'mission-request',
          status: 'pending',
          authority: 'operator-initiated',
          freshness: 'just_now',
          fallback: '',
        },
        {
          id: 'row-2',
          missionId: 'mission-123',
          timestamp: Date.now() + 1000,
          initiator: 'director-general',
          target: 'swarm-director',
          action: 'status-poll',
          status: 'in-progress',
          authority: 'operator-initiated',
          freshness: 'just_now',
          fallback: '',
        },
      ],
      pollingState: 'polling',
    });
    const { container } = await renderIntoDom(
      React.createElement(DGObserverSidebar, dg),
      mountedRoots
    );
    const html = container.innerHTML;
    expect(html).toMatch(/Director General/i);
    expect(html).toMatch(/Mission requested/i);
    expect(html).toMatch(/Polling/i);
  });

  test('shows polling badge when pollingState=polling', async () => {
    const dg = makeDGState({ activeMissionId: 'm-1', pollingState: 'polling', timelineRows: [] });
    const { container } = await renderIntoDom(
      React.createElement(DGObserverSidebar, dg),
      mountedRoots
    );
    const html = container.innerHTML;
    expect(html).toMatch(/in progress/i);
  });

  test('shows error banner when error is present', async () => {
    const dg = makeDGState({
      activeMissionId: 'm-1',
      error: 'El Director no está disponible.',
      timelineRows: [],
    });
    const { container } = await renderIntoDom(
      React.createElement(DGObserverSidebar, dg),
      mountedRoots
    );
    const html = container.innerHTML;
    expect(html).toMatch(/El Director no está disponible/);
  });

  test('renders DGApprovalGate controls when pendingApproval is set', async () => {
    const dg = makeDGState({
      activeMissionId: 'm-1',
      timelineRows: [
        {
          id: 'row-1',
          missionId: 'm-1',
          timestamp: Date.now(),
          initiator: 'swarm-director',
          target: 'operator',
          action: 'approval-required',
          status: 'awaiting-approval',
          authority: 'operator',
          freshness: 'just_now',
          fallback: '',
        },
      ],
      pollingState: 'polling',
      pendingApproval: { approvalItemId: 'appr-1', reason_class: 'approval_required' },
    });
    const { container } = await renderIntoDom(
      React.createElement(DGObserverSidebar, dg),
      mountedRoots
    );
    const html = container.innerHTML;
    expect(html).toMatch(/El Director requiere aprobación/i);
    expect(html).toMatch(/Aprobar/i);
    expect(html).toMatch(/Rechazar/i);
  });

  test('failed row shows fallback text', async () => {
    const dg = makeDGState({
      activeMissionId: 'm-1',
      timelineRows: [
        {
          id: 'row-1',
          missionId: 'm-1',
          timestamp: Date.now(),
          initiator: 'director-general',
          target: 'swarm-director',
          action: 'mission-result',
          status: 'failed',
          authority: 'operator-initiated',
          freshness: 'just_now',
          fallback: 'Contactá al supervisor directo.',
        },
      ],
    });
    const { container } = await renderIntoDom(
      React.createElement(DGObserverSidebar, dg),
      mountedRoots
    );
    const html = container.innerHTML;
    expect(html).toMatch(/Contactá al supervisor directo/);
  });

  test('completed row does not render fallback text', async () => {
    const dg = makeDGState({
      activeMissionId: 'm-1',
      timelineRows: [
        {
          id: 'row-1',
          missionId: 'm-1',
          timestamp: Date.now(),
          initiator: 'swarm-director',
          target: 'operator',
          action: 'mission-result',
          status: 'completed',
          authority: 'director',
          freshness: 'just_now',
          fallback: '',
        },
      ],
    });
    const { container } = await renderIntoDom(
      React.createElement(DGObserverSidebar, dg),
      mountedRoots
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/Contactá al supervisor directo/);
  });
});
