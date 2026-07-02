'use client';

import { useState, useCallback } from 'react';

/**
 * DemoCard — shared wrapper for each Motion Lab demo.
 *
 * Renders the title, description, config readout, a live preview slot,
 * replay button, and like/dislike controls. Each demo supplies a
 * `render({ replayKey, replay, isReduced })` function so it can re-trigger
 * its animation and respect the page's reduced-motion state.
 */
export function DemoCard({ index, title, description, config, render, vote, onVote, isReduced }) {
  const [replayKey, setReplayKey] = useState(0);
  const replay = useCallback(() => setReplayKey((k) => k + 1), []);

  const voteButtonStyle = (active) => ({
    padding: '6px 10px',
    fontSize: 12,
    borderRadius: 8,
    border: '1px solid var(--border-subtle, #2a2a2a)',
    background: active ? 'var(--surface-3, #2a2a2a)' : 'transparent',
    color: 'inherit',
    cursor: 'pointer',
  });

  return (
    <section
      style={{
        border: '1px solid var(--border-subtle, #2a2a2a)',
        borderRadius: 14,
        padding: 18,
        background: 'var(--surface-1, #141414)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {index}. {title}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.7 }}>{description}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onVote('like')}
            aria-pressed={vote === 'like'}
            style={voteButtonStyle(vote === 'like')}
          >
            👍 like
          </button>
          <button
            type="button"
            onClick={() => onVote('dislike')}
            aria-pressed={vote === 'dislike'}
            style={voteButtonStyle(vote === 'dislike')}
          >
            👎 dislike
          </button>
          <button
            type="button"
            onClick={replay}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid var(--border-subtle, #2a2a2a)',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            ↺ replay
          </button>
        </div>
      </div>

      <div
        style={{
          minHeight: 120,
          borderRadius: 10,
          border: '1px dashed var(--border-subtle, #2a2a2a)',
          background: 'var(--surface-app, #0d0d0d)',
          padding: 16,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {render({ replayKey, replay, isReduced })}
      </div>

      <code
        style={{
          fontSize: 11,
          opacity: 0.8,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          background: 'var(--surface-2, #1a1a1a)',
          padding: '6px 8px',
          borderRadius: 6,
          alignSelf: 'flex-start',
        }}
      >
        {config}
      </code>
    </section>
  );
}

export default DemoCard;
