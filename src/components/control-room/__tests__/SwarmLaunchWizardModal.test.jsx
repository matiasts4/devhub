const {
  getWizardModalChromeStyle,
  getWizardStepButtonStyle,
  getWizardStepIndexStyle,
  getWizardPrimaryActionStyle,
  getWizardSecondaryActionStyle,
  getWizardHeaderActionStyle,
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

  test('header/action styles do not force width 100% (prevents crushing title beside Cerrar)', () => {
    const primary = getWizardPrimaryActionStyle();
    const secondary = getWizardSecondaryActionStyle();
    const headerAction = getWizardHeaderActionStyle();
    const step = getWizardStepButtonStyle({ active: false });

    // Step rail stays full-width; header/actions must not.
    expect(step.width).toBe('100%');
    expect(primary.width).toBe('auto');
    expect(secondary.width).toBe('auto');
    expect(headerAction.width).toBe('auto');
    expect(headerAction.flexShrink).toBe(0);
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
  const fs = require('fs');
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

  test('modal labels TUI clients and default model distinctly and filters models by program', () => {
    const source = readModalSource();
    expect(source).toMatch(/Cliente TUI/);
    expect(source).toMatch(/Modelo por defecto/);
    expect(source).toMatch(/filterModelsForProgram/);
    expect(source).toMatch(/supports_model/);
    expect(source).toMatch(/Runtime por rol/);
  });

  test('modal uses responsive shell breakpoints for steps and sticky actions', () => {
    const source = readModalSource();
    expect(source).toMatch(/lg:grid-cols-\[200px_minmax\(0,1fr\)\]/);
    expect(source).toMatch(/xl:grid-cols-\[210px_minmax\(0,1fr\)_280px\]/);
    expect(source).toMatch(/xl:hidden/);
    expect(source).toMatch(/CompactStepRail|lg:hidden/);
    expect(source).toMatch(/getWizardHeaderActionStyle/);
  });

  test('the default model select only sets providerId — it never fans out into every role', () => {
    const source = readModalSource();
    expect(source).toMatch(/onChange=\{\(event\) => onDraftChange\(\{ providerId: event\.target\.value \}\)\}/);
    expect(source).not.toMatch(/applyDefaultModelToRoles/);
  });

  test('per-role model edits write the sparse override, not the derived effective map', () => {
    const source = readModalSource();
    expect(source).toMatch(/currentModel=\{entry\.model_override \|\| ''\}/);
    expect(source).toMatch(/onDraftChange\(\{\s*roleModelOverrides:/);
    expect(source).not.toMatch(/onDraftChange\(\{\s*roleModels:/);
  });

  test('the effective model is visible on each role card and in the launch review', () => {
    const source = readModalSource();
    expect(source).toMatch(/effectiveModel=\{entry\.model_id\}/);
    expect(source).toMatch(/entry\.model_id \? ` · \$\{entry\.model_id\}` : ''/);
  });
});
