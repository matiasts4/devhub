/**
 * Feature flag utility for CommandBar.
 *
 * The CommandBar is gated behind NEXT_PUBLIC_COMMANDBAR_ENABLED environment variable.
 * When disabled, the CommandBar component should not render and keyboard shortcuts
 * should not be registered.
 *
 * @module commandBar/featureFlag
 */

/**
 * Check if CommandBar feature is enabled.
 *
 * @returns {boolean} True if NEXT_PUBLIC_COMMANDBAR_ENABLED === 'true', false otherwise
 */
export function isCommandBarEnabled() {
  return process.env.NEXT_PUBLIC_COMMANDBAR_ENABLED === 'true';
}
