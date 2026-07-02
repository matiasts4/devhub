'use client';

/**
 * MotionModeToggle — 3-way segmented control for the Motion Lab's simulated
 * motion mode: reduced · normal · amplified.
 *
 * The three modes are mutually exclusive. The parent page owns the state and
 * feeds it into MotionModeProvider + MotionConfig.
 */

const MODES = ['reduced', 'normal', 'amplified'];

export function MotionModeToggle({ mode, onModeChange, id = 'motion-mode-toggle' }) {
  return (
    <div
      role="group"
      aria-label="Motion mode"
      id={id}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: 4,
        borderRadius: 10,
        border: '1px solid var(--border-subtle, #2a2a2a)',
        background: 'var(--surface-2, #1a1a1a)',
        alignSelf: 'flex-start',
        width: 'fit-content',
      }}
    >
      {MODES.map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onModeChange(m);
            }}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 8,
              border: 'none',
              background: active ? 'var(--surface-3, #2a2a2a)' : 'transparent',
              color: active ? 'inherit' : 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

export default MotionModeToggle;
