jest.mock(
  'react-router-dom',
  () => ({
    useOutletContext: () => ({ project: null }),
  }),
  { virtual: true }
);

const {
  getSwarmControlChromeStyles,
  getSwarmControlLayoutButtonVariant,
} = require('../SwarmControl');

describe('SwarmControl chrome helpers', () => {
  test('builds morphology-driven chrome styles for summary, controls, inputs, and chips', () => {
    const styles = getSwarmControlChromeStyles();

    expect(styles.launchSummaryShell.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(styles.launchSummaryShell.borderColor).toBe('var(--chrome-border-color)');
    expect(styles.launchSummaryCard.background).toContain('var(--chrome-control-fill)');
    expect(styles.controlSection.background).toContain('var(--chrome-panel-fill)');
    expect(styles.controlCluster.background).toContain('var(--chrome-control-fill)');
    expect(styles.filterInput.background).toBe('var(--chrome-control-fill)');
    expect(styles.filterInput.borderRadius).toBe('var(--chrome-radius-control)');
    expect(styles.statChip.background).toContain('var(--chrome-control-fill)');
    expect(JSON.stringify(styles)).not.toContain('var(--surface-app)');
    expect(JSON.stringify(styles)).not.toContain('var(--surface-elevated)');
  });

  test('resolves active and inactive layout toggle variants from the current layout', () => {
    expect(getSwarmControlLayoutButtonVariant('grid', 'grid')).toBe('devhubGlass');
    expect(getSwarmControlLayoutButtonVariant('grid', 'stack')).toBe('devhubGhost');
    expect(getSwarmControlLayoutButtonVariant('stack', 'stack')).toBe('devhubGlass');
    expect(getSwarmControlLayoutButtonVariant('stack', 'grid')).toBe('devhubGhost');
  });
});
