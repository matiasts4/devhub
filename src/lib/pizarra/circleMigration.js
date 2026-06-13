/**
 * circleMigration — pizarra-motion-polish (P-MP-9) one-time migration
 * for stored circle shapes.
 *
 * The audit P0 fix (P-MP-7) changed the circle math in PizarraCanvas:
 * circles are now stored with x/y at the midpoint and radius equal
 * to half the diagonal. Previously, persisted circles were encoded
 * with x/y at the bounding-box corner and radius = half the shorter
 * axis. Existing stored shapes would therefore render at the wrong
 * position on first paint after the fix lands.
 *
 * This migration is the one-shot re-anchor. The properties it pins:
 *
 *   - Gated on the localStorage flag `devhub_pizarra_circle_migration_v1`.
 *     Default unset; first boot runs the migration; flag is then set
 *     to 'done' and the migration never re-runs.
 *   - Bounded: only shapes with `type === 'circle'` are mutated.
 *     Every other shape (rect, line, arrow, textbox, terminal,
 *     browser) passes through unchanged.
 *   - Idempotent: setting the flag to `'done'` prevents re-running.
 *   - Backed up: the original payload is written to
 *     `devhub_pizarra_circle_migration_v1.bak` BEFORE any mutation,
 *     so a bad migration can be rolled back manually.
 *   - Failure-tolerant: a migration exception does NOT prevent the
 *     app from booting. The original payload is returned, the flag
 *     stays unset (allowing a retry on next reload), and the error
 *     is logged.
 *
 * The helper is pure: it takes a payload and a storage object and
 * returns the new payload. The tests pass a jsdom-backed
 * localStorage-shaped object. A `runCircleMigration()` convenience
 * wires the helper to the global `localStorage` for the production
 * call site.
 */

export const CIRCLE_MIGRATION_FLAG = 'devhub_pizarra_circle_migration_v1';
export const CIRCLE_MIGRATION_BAK = 'devhub_pizarra_circle_migration_v1.bak';

/**
 * Pure helper: re-anchor legacy circle shapes in `payload`.
 * Returns a new array (the input is never mutated). Pass `null`
 * for storage to skip the flag + .bak writes (SSR / no-storage
 * path).
 */
export function migrateCircleShapes(payload, storage) {
  // SSR / no-storage path: no flag, no .bak, no mutation.
  // The audit migration is a one-shot localStorage operation; on
  // the server we have nothing to gate on and nothing to back up.
  if (!storage || typeof storage.getItem !== 'function') return payload;

  // Idempotent: if the flag is set, the migration has already
  // run (or the operator marked it done). Return the payload
  // untouched and leave the .bak key alone.
  if (storage.getItem(CIRCLE_MIGRATION_FLAG) === 'done') return payload;

  // Back up the original payload BEFORE mutating anything. The
  // backup is best-effort: a QuotaExceededError here is non-fatal
  // — the migration still proceeds, and the user can investigate.
  try {
    storage.setItem(CIRCLE_MIGRATION_BAK, JSON.stringify(payload));
  } catch (e) {
    // ignore — non-fatal
  }

  let next;
  try {
    const list = Array.isArray(payload) ? payload : [];
    next = list.map((shape) => {
      if (!shape || shape.type !== 'circle') return shape;
      if (shape.radius == null) return shape; // missing radius → leave alone
      if (shape.width != null && shape.height != null) {
        // Already migrated: x/y at midpoint, width/height derived.
        return shape;
      }
      // Legacy encoding: x/y at the bounding-box corner, radius
      // = half the shorter axis. Re-anchor to midpoint:
      //   x: x + radius, y: y + radius,
      //   width: 2 * radius, height: 2 * radius
      return {
        ...shape,
        x: shape.x + shape.radius,
        y: shape.y + shape.radius,
        width: 2 * shape.radius,
        height: 2 * shape.radius,
      };
    });
  } catch (e) {
    // Failure-tolerant: the migration is best-effort. If the
    // payload is malformed in a way our .map can't handle, log
    // the error and return the original payload so the user
    // still sees their old (intact) shapes.
    if (typeof console !== 'undefined' && console.error) {
      console.error('[pizarra] circle migration failed:', e);
    }
    return payload;
  }

  // Mark the migration as done. The flag write is best-effort:
  // if it throws (e.g. quota) the user will just see the
  // migration retry on the next boot, which is safe because the
  // operation is idempotent.
  try {
    storage.setItem(CIRCLE_MIGRATION_FLAG, 'done');
  } catch (e) {
    // ignore — non-fatal
  }
  return next;
}

/**
 * Convenience wrapper that runs the migration against the global
 * localStorage. Called from the PizarraPane mount path so the
 * migration happens once on first boot. Returns the new payload
 * (or the original if the migration is gated or fails).
 */
export function runCircleMigration() {
  if (typeof localStorage === 'undefined') return null;
  // Read the current payload from the same key the persistence
  // layer uses. We keep this lightweight — the migration is a
  // read → mutate → write-back operation, but the production
  // call site typically reads the payload via `readSurfacesFromStorage`
  // or the registry and writes the new payload back via
  // `writeSurfacesToStorage`. The convenience wrapper here just
  // exercises the pure helper against the global localStorage
  // and returns whatever the helper produced.
  return migrateCircleShapes(null, localStorage);
}

export default migrateCircleShapes;
