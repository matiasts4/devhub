'use client';

/**
 * AuthorityBadge — visual indicator for timeline item authority (D-7, OET-6).
 *
 * Renders a small coloured dot for 'secondary_hint' items.
 * 'primary' items are never shown — it's noise in the feed.
 *
 * Props:
 *   authority: 'primary' | 'secondary_hint'
 */
export default function AuthorityBadge({ authority }) {
  if (authority !== 'secondary_hint') return null;

  return (
    <span
      title="Live — not yet confirmed"
      aria-label="Live — not yet confirmed"
      className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"
    />
  );
}
