/**
 * Pure sidebar utilities — extracted for testability.
 * No React/router imports — zero side effects.
 */

/**
 * Returns the collapsed sidebar width as a Tailwind class.
 * 48px (w-12) — slimmer collapsed rail vs previous w-16 (64px).
 */
export function getCollapsedWidth() {
  return 'w-12';
}

/**
 * Builds the nav item class string.
 * Active state uses amber accent tokens (no cyan).
 *
 * @param {boolean} collapsed
 * @param {boolean} isActive
 * @returns {string}
 */
export function getNavItemClasses(collapsed, isActive) {
  const layout = `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} ${
    collapsed ? 'px-0 py-2' : 'px-3 py-2'
  } rounded-xl text-xs font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 cursor-pointer border`;

  if (isActive) {
    return `${layout} bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent-primary)_16%,transparent),rgba(255,255,255,0.05))] text-[var(--text-primary)] border-[color:color-mix(in_srgb,var(--accent-primary)_28%,transparent)] shadow-[0_10px_20px_rgba(0,0,0,0.16)]`;
  }
  return `${layout} border-transparent bg-transparent text-[var(--text-muted)] shadow-none hover:text-[var(--text-primary)] hover:bg-white/[0.05] hover:border-white/8 hover:shadow-[0_10px_18px_rgba(0,0,0,0.12)] active:scale-[0.985]`;
}
