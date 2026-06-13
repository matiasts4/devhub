export const WORKSPACE_TERMINAL_COUNT_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

export const WORKSPACE_SETUP_SECTIONS = ['terminals', 'commandPresets', 'customCommand'];

export function clampTerminalCount(value, min = 0, max = 6) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function resolveTerminalCountDelta(event) {
  const key = String(event?.key || '');
  if (key === 'ArrowRight') return 1;
  if (key === 'ArrowLeft') return -1;
  return 0;
}

export function resolveSectionNavigationDelta(event) {
  const key = String(event?.key || '');
  if (key === 'ArrowDown') return 1;
  if (key === 'ArrowUp') return -1;
  return 0;
}

export function getWorkspaceSetupSections({ commandApplies = true } = {}) {
  return commandApplies ? WORKSPACE_SETUP_SECTIONS : ['terminals'];
}

export function getAdjacentWorkspaceSetupSection(currentSection, delta, options = {}) {
  const sections = getWorkspaceSetupSections(options);
  const currentIndex = sections.indexOf(currentSection);
  const normalizedIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = normalizedIndex + delta;
  if (nextIndex < 0) return sections[0];
  if (nextIndex >= sections.length) return sections[sections.length - 1];
  return sections[nextIndex];
}

export function isWorkspaceTerminalCustomCommandInput(element) {
  if (!element || typeof element !== 'object') return false;
  return element.id === 'workspace-terminal-initial-command';
}

export function isWithinWorkspaceTerminalCountSection(element, root) {
  if (!element || !root) return false;
  if (!root.contains(element)) return false;
  return Boolean(element.closest?.('[data-testid="workspace-terminal-count-section"]'));
}

export function isWithinWorkspaceTerminalCommandPresets(element, root) {
  if (!element || !root) return false;
  if (!root.contains(element)) return false;
  return Boolean(element.closest?.('[data-testid="workspace-terminal-command-presets"]'));
}

export function isWithinWorkspaceTerminalCommandSection(element, root) {
  if (!element || !root) return false;
  if (!root.contains(element)) return false;
  return Boolean(element.closest?.('[data-testid="workspace-terminal-command-section"]'));
}

export function resolveWorkspaceSetupSection(element, root) {
  if (!element || !root || !root.contains(element)) return null;
  if (isWorkspaceTerminalCustomCommandInput(element)) return 'customCommand';
  if (isWithinWorkspaceTerminalCountSection(element, root)) return 'terminals';
  if (isWithinWorkspaceTerminalCommandPresets(element, root)) return 'commandPresets';
  if (isWithinWorkspaceTerminalCommandSection(element, root)) return 'commandPresets';
  return null;
}

export function shouldAdjustTerminalCountFromKeyboard(event, { activeSection, activeElement, modalRoot }) {
  if (!modalRoot || !activeElement) return false;
  if (!modalRoot.contains(activeElement)) return false;
  if (activeSection !== 'terminals') return false;
  return resolveTerminalCountDelta(event) !== 0;
}

export function shouldNavigateWorkspaceSetupSections(event, { activeElement, modalRoot }) {
  if (!modalRoot || !activeElement) return false;
  if (!modalRoot.contains(activeElement)) return false;
  return resolveSectionNavigationDelta(event) !== 0;
}

export function getAdjacentCircularIndex(currentIndex, delta, length) {
  if (!Number.isFinite(length) || length <= 0) return 0;
  const normalized = Number.isFinite(currentIndex) ? currentIndex : 0;
  return (normalized + delta + length) % length;
}

export function resolveCommandPresetArrowDelta(event) {
  const key = String(event?.key || '');
  if (key === 'ArrowRight') return 1;
  if (key === 'ArrowLeft') return -1;
  return 0;
}

export function shouldNavigateCommandPresetsFromKeyboard(event, { activeSection, activeElement, modalRoot }) {
  if (!modalRoot || !activeElement) return false;
  if (!modalRoot.contains(activeElement)) return false;
  if (activeSection !== 'commandPresets') return false;
  if (isWorkspaceTerminalCustomCommandInput(activeElement)) return false;
  return resolveCommandPresetArrowDelta(event) !== 0;
}

export function shouldConfirmWorkspaceTerminalSetup(event, { activeElement, modalRoot }) {
  if (!modalRoot || !activeElement) return false;
  if (!modalRoot.contains(activeElement)) return false;
  if (String(event?.key || '') !== 'Enter') return false;
  if (event?.shiftKey || event?.ctrlKey || event?.metaKey || event?.altKey) return false;
  if (activeElement.dataset?.workspaceTerminalSetupCancel === 'true') return false;
  return true;
}