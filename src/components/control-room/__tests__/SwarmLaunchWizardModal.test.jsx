const {
  getWizardModalChromeStyle,
  getWizardStepButtonStyle,
  getWizardStepIndexStyle,
  getWizardPrimaryActionStyle,
  getWizardSecondaryActionStyle,
  getWizardInsetPanelStyle,
  getWizardFieldStyle,
  getWizardDangerBannerStyle,
  getWizardCloseButtonStyle,
} = require('../SwarmLaunchWizardModal');

describe('SwarmLaunchWizardModal morphology chrome', () => {
  test('modal shell uses shared morphology tokens instead of hardcoded amber shell values', () => {
    const style = getWizardModalChromeStyle();

    expect(style).toEqual(
      expect.objectContaining({
        borderColor: 'var(--chrome-border-color)',
        borderWidth: 'var(--chrome-border-width)',
        borderRadius: 'var(--chrome-radius-panel)',
        boxShadow: 'var(--chrome-shadow-panel)',
      })
    );

    expect(style.background).toContain('var(--chrome-panel-fill-emphasis)');
  });

  test('step controls and primary action keep accent-driven palette via morphology factories', () => {
    const activeStep = getWizardStepButtonStyle({ active: true });
    const activeIndex = getWizardStepIndexStyle({ active: true });
    const primaryAction = getWizardPrimaryActionStyle();

    expect(activeStep.background).toContain('var(--accent-primary)');
    expect(activeStep.border).toContain('var(--accent-primary)');
    expect(activeStep.borderRadius).toBe('var(--chrome-radius-control)');

    expect(activeIndex.background).toContain('var(--accent-primary)');
    expect(activeIndex.borderColor).toContain('var(--accent-primary)');
    expect(activeIndex.borderWidth).toBe('var(--chrome-border-width)');

    expect(primaryAction.background).toContain('var(--accent-primary)');
    expect(primaryAction.border).toContain('var(--accent-primary)');
    expect(JSON.stringify({ activeStep, activeIndex, primaryAction })).not.toContain('255,176,64');
  });

  test('inactive wizard controls and shell sections stay on shared morphology surfaces instead of transparent legacy fills', () => {
    const modal = getWizardModalChromeStyle();
    const inactiveStep = getWizardStepButtonStyle({ active: false });
    const inactiveIndex = getWizardStepIndexStyle({ active: false });
    const insetPanel = getWizardInsetPanelStyle();
    const emphasizedInsetPanel = getWizardInsetPanelStyle({ emphasized: true });

    expect(modal.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(inactiveStep.background).toContain('var(--chrome-control-fill)');
    expect(inactiveStep.border).toContain('var(--chrome-border-color)');
    expect(inactiveIndex.background).toContain('var(--chrome-control-fill)');
    expect(insetPanel.background).toContain('var(--chrome-panel-fill)');
    expect(emphasizedInsetPanel.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(JSON.stringify({ inactiveStep, inactiveIndex, insetPanel })).not.toContain(
      'transparent'
    );
  });

  test('close button stays compact and does not inherit full-width wizard action layout', () => {
    const closeButton = getWizardCloseButtonStyle();

    expect(closeButton.width).toBeUndefined();
    expect(closeButton.flexShrink).toBe(0);
    expect(closeButton.border).toContain('var(--chrome-border-color)');
  });

  test('wizard fields and secondary feedback chrome align with shared control tokens and danger accents', () => {
    const fieldStyle = getWizardFieldStyle();
    const secondaryAction = getWizardSecondaryActionStyle();
    const dangerBanner = getWizardDangerBannerStyle();

    expect(fieldStyle.background).toContain('var(--chrome-control-fill)');
    expect(fieldStyle.border).toContain('var(--chrome-border-color)');

    expect(secondaryAction.background).toContain('var(--chrome-control-fill)');
    expect(secondaryAction.border).toContain('var(--chrome-border-color)');

    expect(dangerBanner.border).toContain('var(--danger)');
    expect(dangerBanner.color).toBe('var(--danger)');
    expect(dangerBanner.borderRadius).toBe('var(--chrome-radius-panel)');
    expect(JSON.stringify({ fieldStyle, secondaryAction })).not.toContain('var(--surface-app)');
  });
});

// =========================================================================
// T-018 hook: spawnStrategy field on the launch modal.
//
// T-018 is being designed separately (lazy spawn). This is a UI hook only —
// add a `spawnStrategy` field to the modal with values `automatic` (default)
// and `all-at-once`, and pass it through to the launch request body.
//
// We test the contract at the source level (no @testing-library/react
// is installed in this project, and rendering React components through
// jest's babel transform is fragile for portals/SSR). The source-level
// check verifies the modal has:
//   (a) A spawnStrategy field with default 'automatic'
//   (b) The field is passed through onDraftChange to the launch request
// =========================================================================
describe('T-018 hook: SwarmLaunchWizardModal spawnStrategy field', () => {
  // eslint-disable-next-line global-require
  const fs = require('fs');
  // eslint-disable-next-line global-require
  const path = require('path');

  function readModalSource() {
    return fs.readFileSync(path.join(__dirname, '..', 'SwarmLaunchWizardModal.jsx'), 'utf8');
  }

  test('modal renders the spawnStrategy field with default `lazy-on-demand`', () => {
    const source = readModalSource();
    expect(source).toMatch(/spawnStrategy/);
    expect(source).toMatch(/value=\{draft\.spawnStrategy\s*\|\|\s*['"]lazy-on-demand['"]/);
    expect(source).toMatch(/lazy-on-demand/);
  });

  test('modal passes spawnStrategy through to the launch request body via onDraftChange', () => {
    const source = readModalSource();
    // The select must call onDraftChange with the new value
    // (proves the field is connected to the launch draft, not just visual).
    expect(source).toMatch(/onDraftChange\(\{\s*spawnStrategy/);
    // The launch body is whatever the parent builds from `draft`. We
    // verify by checking the modal has at least one place where the
    // full draft is sent (e.g. onLaunch or the JSON payload preview).
    expect(source).toMatch(/JSON\.stringify\(draft|JSON\.stringify\([\s\S]*?draft/);
  });
});
