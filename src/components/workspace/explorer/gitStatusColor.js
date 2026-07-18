/** Theme tokens — never rely on Tailwind color utilities for git tint. */
const GIT_COLOR_VAR = {
  M: 'var(--explorer-git-m)',
  A: 'var(--explorer-git-a)',
  U: 'var(--explorer-git-u)',
  D: 'var(--explorer-git-d)',
  R: 'var(--explorer-git-r)',
};

export function explorerGitColor(code) {
  return GIT_COLOR_VAR[code] || '';
}

/** @deprecated use explorerGitColor + inline style */
export function explorerGitTextClass(_code) {
  return '';
}

export function explorerGitMarker(code) {
  if (!code) return '';
  return code;
}
