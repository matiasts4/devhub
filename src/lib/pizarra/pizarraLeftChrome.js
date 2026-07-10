/**
 * Left-edge chrome on the pizarra canvas: view-switch swipe vs tools HUD.
 * Keep these regions disjoint so pointer targets do not compete.
 */

/** Horizontal band for edge drag (V1 ↔ V2). */
export const PIZARRA_LEFT_SWIPE_WIDTH_PX = 40;

/** Bottom-left stack: reveal tools + zoom dock. */
export const PIZARRA_LEFT_HUD_STACK_WIDTH_PX = 56;
export const PIZARRA_LEFT_HUD_STACK_HEIGHT_PX = 148;

/** Swipe zone stops above the HUD stack (left edge only). */
export const PIZARRA_LEFT_SWIPE_INSET_BOTTOM_PX = PIZARRA_LEFT_HUD_STACK_HEIGHT_PX;

/** Palette + zoom column width while HUD is open. */
export const PIZARRA_LEFT_HUD_DOCK_WIDTH_PX = 88;
