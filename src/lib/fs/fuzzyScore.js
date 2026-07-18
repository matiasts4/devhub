/**
 * Simple subsequence fuzzy score (higher is better). No WASM deps.
 * Returns null when query is not a subsequence of candidate.
 */
export function fuzzyScore(candidate, query) {
  const hay = String(candidate || '');
  const needle = String(query || '').trim();
  if (!needle) return 0;
  if (!hay) return null;

  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  let hi = 0;
  let score = 0;
  let prev = -2;
  let consecutive = 0;

  for (let ni = 0; ni < n.length; ni += 1) {
    const ch = n[ni];
    const found = h.indexOf(ch, hi);
    if (found === -1) return null;
    if (found === prev + 1) {
      consecutive += 1;
      score += 8 + consecutive * 4;
    } else {
      consecutive = 0;
      score += 2;
    }
    // Bonus for matching at start of segment
    if (
      found === 0 ||
      h[found - 1] === '/' ||
      h[found - 1] === '.' ||
      h[found - 1] === '-' ||
      h[found - 1] === '_'
    ) {
      score += 6;
    }
    prev = found;
    hi = found + 1;
  }

  // Prefer shorter relative paths on ties (applied by caller via length)
  score -= Math.min(40, hay.length * 0.15);
  return score;
}

export function rankFuzzy(hits, query, limit = 200) {
  const scored = [];
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    const s = fuzzyScore(hit.rel || hit.name, query);
    if (s == null) continue;
    scored.push({ s, i, len: (hit.rel || '').length });
  }
  scored.sort((a, b) => b.s - a.s || a.len - b.len);
  return scored.slice(0, limit).map(({ i }) => hits[i]);
}
