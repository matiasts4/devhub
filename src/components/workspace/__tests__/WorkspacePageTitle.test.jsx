const React = require('react');
const { installDom, renderIntoDom, cleanupMountedRoots } = require('@/test-support/domHarness');

const WorkspacePageTitleModule = require('../WorkspacePageTitle.jsx');
const WorkspacePageTitle = WorkspacePageTitleModule.default;
const { getWorkspacePageTitleProjectBadgeProps } = WorkspacePageTitleModule;

const mountedRoots = [];

describe('WorkspacePageTitle morphology chrome', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
  });

  test('project badge helper resolves morphology token-driven chrome props', () => {
    const badge = getWorkspacePageTitleProjectBadgeProps();

    expect(badge.className).toContain('rounded-[var(--chrome-radius-control)]');
    expect(badge.className).toContain('border-[length:var(--chrome-border-width)]');
    expect(badge.style).toEqual(
      expect.objectContaining({
        borderColor: 'var(--chrome-border-color)',
        background: 'var(--chrome-control-fill)',
        boxShadow: 'var(--chrome-shadow-control)',
      })
    );
  });

  test('renders project badge with morphology-driven chrome hooks', async () => {
    const view = await renderIntoDom(
      React.createElement(WorkspacePageTitle, {
        title: 'Dashboard',
        projectName: 'DevHub',
      }),
      mountedRoots
    );
    const badge = view.container.querySelector('[data-chrome-surface="project-badge"]');

    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('DevHub');
  });
});
