const {
  getWizardModalChromeStyle,
  getWizardStepButtonStyle,
  getWizardStepIndexStyle,
  getWizardPrimaryActionStyle,
  getWizardSecondaryActionStyle,
  getWizardInsetPanelStyle,
  getWizardFieldStyle,
  getWizardDangerBannerStyle,
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

  test('step controls and primary action use token-driven control chrome without amber rgba literals', () => {
    const activeStep = getWizardStepButtonStyle({ active: true });
    const activeIndex = getWizardStepIndexStyle({ active: true });
    const primaryAction = getWizardPrimaryActionStyle();

    expect(activeStep.background).toContain('var(--chrome-control-fill-hover)');
    expect(activeStep.borderColor).toBe('var(--chrome-border-color)');
    expect(activeStep.borderWidth).toBe('var(--chrome-border-width)');
    expect(activeStep.boxShadow).toBe('var(--chrome-shadow-control)');

    expect(activeIndex.background).toBe('var(--chrome-control-fill)');
    expect(activeIndex.borderColor).toBe('var(--chrome-border-color)');
    expect(activeIndex.borderWidth).toBe('var(--chrome-border-width)');

    expect(primaryAction.background).toContain('var(--chrome-control-fill-hover)');
    expect(primaryAction.borderColor).toBe('var(--chrome-border-color)');
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
    expect(inactiveStep.boxShadow).toBe('var(--chrome-shadow-control)');
    expect(inactiveIndex.background).toBe('var(--chrome-panel-fill)');
    expect(insetPanel.background).toContain('var(--chrome-panel-fill)');
    expect(emphasizedInsetPanel.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(JSON.stringify({ inactiveStep, inactiveIndex, insetPanel })).not.toContain(
      'transparent'
    );
  });

  test('wizard fields and secondary feedback chrome align with shared control tokens and danger accents', () => {
    const fieldStyle = getWizardFieldStyle();
    const secondaryAction = getWizardSecondaryActionStyle();
    const dangerBanner = getWizardDangerBannerStyle();

    expect(fieldStyle.background).toContain('var(--chrome-control-fill)');
    expect(fieldStyle.borderColor).toBe('var(--chrome-border-color)');
    expect(fieldStyle.boxShadow).toBe('var(--chrome-shadow-control)');

    expect(secondaryAction.background).toContain('var(--chrome-control-fill)');
    expect(secondaryAction.borderColor).toBe('var(--chrome-border-color)');
    expect(secondaryAction.boxShadow).toBe('var(--chrome-shadow-control)');

    expect(dangerBanner.borderColor).toContain('var(--danger)');
    expect(dangerBanner.background).toContain('var(--chrome-panel-fill)');
    expect(dangerBanner.boxShadow).toContain('var(--chrome-shadow-control)');
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

  test('modal renders the spawnStrategy field with default `automatic`', () => {
    const source = readModalSource();
    // The modal source must define a spawnStrategy control
    expect(source).toMatch(/spawnStrategy/);
    // The control's default value must be 'automatic' (the default option)
    expect(source).toMatch(/value=\{draft\.spawnStrategy\s*\|\|\s*['"]automatic['"]/);
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
