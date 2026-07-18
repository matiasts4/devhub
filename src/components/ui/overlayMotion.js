/**
 * Shared Tailwind animation class fragments for Radix overlays.
 * Tuned for a soft premium feel: light blurred scrim, short zoom modals,
 * short-travel sheets. Structural chrome stays instant elsewhere.
 */

/** Overlay scrim — light dim + blur, fade only. */
export const OVERLAY_SCRIM_MOTION =
  'bg-black/30 supports-[backdrop-filter]:backdrop-blur-sm duration-100 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

/**
 * Centered modal panel — fade + slight zoom (no diagonal slide).
 */
export const OVERLAY_MODAL_MOTION =
  'duration-100 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';

/** Popover / menu / select — fade + zoom + tiny side slide. */
export const OVERLAY_POPOVER_MOTION =
  'duration-100 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2';

/** Sheet / drawer panel base (side-specific short-travel slides appended by CVA). */
export const OVERLAY_SHEET_MOTION =
  'transition ease-in-out data-[state=closed]:duration-200 data-[state=open]:duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0';
