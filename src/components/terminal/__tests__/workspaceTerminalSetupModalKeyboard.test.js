const { installDom } = require('@/test-support/domHarness');
const {
  clampTerminalCount,
  getAdjacentCircularIndex,
  getAdjacentWorkspaceSetupSection,
  getWorkspaceSetupSections,
  resolveCommandPresetArrowDelta,
  resolveSectionNavigationDelta,
  resolveTerminalCountDelta,
  shouldAdjustTerminalCountFromKeyboard,
  shouldConfirmWorkspaceTerminalSetup,
  shouldNavigateCommandPresetsFromKeyboard,
  shouldNavigateWorkspaceSetupSections,
} = require('../workspaceTerminalSetupModalKeyboard.js');

describe('workspaceTerminalSetupModalKeyboard', () => {
  let dom;

  beforeEach(() => {
    dom = installDom('https://devhub.test/terminales');
  });

  afterEach(() => {
    dom.window.close();
  });

  test('resolveTerminalCountDelta only uses left and right arrows', () => {
    expect(resolveTerminalCountDelta({ key: 'ArrowRight' })).toBe(1);
    expect(resolveTerminalCountDelta({ key: 'ArrowLeft' })).toBe(-1);
    expect(resolveTerminalCountDelta({ key: 'ArrowUp' })).toBe(0);
    expect(resolveTerminalCountDelta({ key: 'ArrowDown' })).toBe(0);
  });

  test('resolveSectionNavigationDelta only uses up and down arrows', () => {
    expect(resolveSectionNavigationDelta({ key: 'ArrowDown' })).toBe(1);
    expect(resolveSectionNavigationDelta({ key: 'ArrowUp' })).toBe(-1);
    expect(resolveSectionNavigationDelta({ key: 'ArrowRight' })).toBe(0);
  });

  test('getAdjacentWorkspaceSetupSection walks terminals → presets → custom command', () => {
    expect(getAdjacentWorkspaceSetupSection('terminals', 1, { commandApplies: true })).toBe(
      'commandPresets'
    );
    expect(getAdjacentWorkspaceSetupSection('commandPresets', 1, { commandApplies: true })).toBe(
      'customCommand'
    );
    expect(getAdjacentWorkspaceSetupSection('customCommand', -1, { commandApplies: true })).toBe(
      'commandPresets'
    );
  });

  test('command sections are skipped when no terminals are selected', () => {
    expect(getWorkspaceSetupSections({ commandApplies: false })).toEqual(['terminals']);
    expect(getAdjacentWorkspaceSetupSection('terminals', 1, { commandApplies: false })).toBe(
      'terminals'
    );
  });

  test('shouldAdjustTerminalCountFromKeyboard only applies in the terminals section', () => {
    const modalRoot = document.createElement('div');
    const countSection = document.createElement('div');
    countSection.setAttribute('data-testid', 'workspace-terminal-count-section');
    const button = document.createElement('button');
    countSection.appendChild(button);
    modalRoot.appendChild(countSection);

    expect(
      shouldAdjustTerminalCountFromKeyboard(
        { key: 'ArrowRight' },
        { activeSection: 'terminals', activeElement: button, modalRoot }
      )
    ).toBe(true);
    expect(
      shouldAdjustTerminalCountFromKeyboard(
        { key: 'ArrowRight' },
        { activeSection: 'commandPresets', activeElement: button, modalRoot }
      )
    ).toBe(false);
  });

  test('shouldNavigateWorkspaceSetupSections applies for modal focus', () => {
    const modalRoot = document.createElement('div');
    const button = document.createElement('button');
    modalRoot.appendChild(button);

    expect(
      shouldNavigateWorkspaceSetupSections(
        { key: 'ArrowDown' },
        { activeElement: button, modalRoot }
      )
    ).toBe(true);
  });

  test('command preset arrows only apply horizontally in the presets section', () => {
    const modalRoot = document.createElement('div');
    const commandSection = document.createElement('div');
    commandSection.setAttribute('data-testid', 'workspace-terminal-command-presets');
    const button = document.createElement('button');
    commandSection.appendChild(button);
    modalRoot.appendChild(commandSection);

    expect(resolveCommandPresetArrowDelta({ key: 'ArrowRight' })).toBe(1);
    expect(resolveCommandPresetArrowDelta({ key: 'ArrowDown' })).toBe(0);
    expect(
      shouldNavigateCommandPresetsFromKeyboard(
        { key: 'ArrowRight' },
        { activeSection: 'commandPresets', activeElement: button, modalRoot }
      )
    ).toBe(true);
  });

  test('Enter confirms except on cancel button', () => {
    const modalRoot = document.createElement('div');
    const confirm = document.createElement('button');
    modalRoot.appendChild(confirm);
    const cancel = document.createElement('button');
    cancel.dataset.workspaceTerminalSetupCancel = 'true';
    modalRoot.appendChild(cancel);

    expect(
      shouldConfirmWorkspaceTerminalSetup({ key: 'Enter' }, { activeElement: confirm, modalRoot })
    ).toBe(true);
    expect(
      shouldConfirmWorkspaceTerminalSetup({ key: 'Enter' }, { activeElement: cancel, modalRoot })
    ).toBe(false);
  });

  test('clampTerminalCount keeps values inside 0..6', () => {
    expect(clampTerminalCount(9)).toBe(6);
    expect(getAdjacentCircularIndex(0, -1, 3)).toBe(2);
  });
});
