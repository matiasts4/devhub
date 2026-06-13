/**
 * Pure sidebar utilities — extracted for testability.
 * No React/router imports — zero side effects.
 */

/**
 * Returns the collapsed sidebar width as a Tailwind class.
 * 52px (w-[52px]) — slimmer collapsed rail, more breathing room than w-12.
 */
export function getCollapsedWidth() {
  return 'w-[52px]';
}

/**
 * Builds the nav item class string.
 * Active state: subtle bg + 2px left-border accent (no hard shadow, no heavy gradient).
 * Refined 2026-06-03 — softer, app-like, matches default morphology.
 *
 * @param {boolean} collapsed
 * @param {boolean} isActive
 * @returns {string}
 */
export function getNavItemClasses(collapsed, isActive) {
  const layout = `flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'} ${
    collapsed ? 'px-0 py-2' : 'pl-3 pr-2.5 py-2'
  } rounded-lg text-[12.5px] font-medium transition-[color,background-color,border-color,transform] duration-150 cursor-pointer border border-transparent`;

  if (isActive) {
    return `${layout} bg-white/[0.05] text-[var(--text-primary)] border-l-2 border-l-[color:var(--accent-primary)] border-t-white/[0.04] border-r-white/[0.04] border-b-white/[0.04]`;
  }
  return `${layout} text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] active:scale-[0.985]`;
}
