const {
  getWorkspacePageShellStyle,
  getWorkspacePageHeaderStyle,
  getWorkspaceBreadcrumbStyle,
  getWorkspaceSectionSurfaceStyle,
  getWorkspaceFilterBarStyle,
} = require('../workspacePageChrome.js');

describe('workspacePageChrome', () => {
  test('tokenizes page shells through shared morphology chrome vars', () => {
    const style = getWorkspacePageShellStyle();

    expect(style.background).toBe('var(--chrome-panel-fill)');
    expect(style.color).toBe('var(--text-primary)');
  });

  test('tokenizes sticky headers without direct surface-card ownership', () => {
    const style = getWorkspacePageHeaderStyle();

    expect(style.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(style.borderBottomColor).toBe('var(--chrome-border-color)');
    expect(JSON.stringify(style)).not.toContain('var(--surface-card)');
  });

  test('tokenizes breadcrumbs and secondary bars through control chrome', () => {
    const breadcrumb = getWorkspaceBreadcrumbStyle();
    const filterBar = getWorkspaceFilterBarStyle();

    expect(breadcrumb.background).toContain('var(--chrome-control-fill)');
    expect(breadcrumb.borderColor).toBe('var(--chrome-border-color)');
    expect(filterBar.background).toContain('var(--chrome-panel-fill)');
    expect(filterBar.boxShadow).toBe('var(--chrome-shadow-panel)');
  });

  test('tokenizes section surfaces while allowing content accents to stay separate', () => {
    const neutral = getWorkspaceSectionSurfaceStyle();
    const emphasized = getWorkspaceSectionSurfaceStyle({ emphasized: true });

    expect(neutral.background).toBe('var(--chrome-panel-fill)');
    expect(emphasized.background).toBe('var(--chrome-panel-fill-emphasis)');
    expect(neutral.borderColor).toBe('var(--chrome-border-color)');
    expect(JSON.stringify(neutral)).not.toContain('#58A6FF');
  });
});
