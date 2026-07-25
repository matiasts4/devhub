// workspaceColors.js — Stable per-workspace identity colors.
// Each workspace gets a deterministic color derived from its id,
// so the assignment survives reloads and reorders.

/**
 * Curated palette tuned for dark chrome backgrounds.
 * Each entry: [r, g, b] — used to compose rgba() tints at varying alpha.
 */
const WORKSPACE_PALETTE = [
  [45, 212, 191], // teal
  [167, 139, 250], // violet
  [251, 191, 36], // amber
  [251, 113, 133], // rose
  [56, 189, 248], // sky
  [163, 230, 53], // lime
  [251, 146, 60], // orange
  [232, 121, 249], // fuchsia
  [34, 211, 238], // cyan
  [190, 242, 100], // yellow-green
];

/**
 * Simple deterministic hash (djb2) over the workspace id.
 */
function hashWorkspaceId(id) {
  const str = String(id || '');
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Returns the palette RGB triplet for a workspace id.
 * @param {string|number} workspaceId
 * @returns {[number, number, number]}
 */
export function getWorkspaceColorRgb(workspaceId) {
  return WORKSPACE_PALETTE[hashWorkspaceId(workspaceId) % WORKSPACE_PALETTE.length];
}

/**
 * Returns an rgba() string for the workspace color at the given alpha.
 * @param {string|number} workspaceId
 * @param {number} alpha 0–1
 * @returns {string}
 */
export function getWorkspaceColor(workspaceId, alpha = 1) {
  const [r, g, b] = getWorkspaceColorRgb(workspaceId);
  return `rgba(${r},${g},${b},${alpha})`;
}
