const DISPLAY_NAME_POOL = [
  'Alex',
  'Avery',
  'Blake',
  'Cameron',
  'Casey',
  'Cesar',
  'Chase',
  'Dakota',
  'Drew',
  'Emerson',
  'Finley',
  'Harper',
  'Hayden',
  'Jamie',
  'Jordan',
  'Kendall',
  'Logan',
  'Morgan',
  'Nate',
  'Parker',
  'Peyton',
  'Phoenix',
  'Quinn',
  'Reese',
  'Riley',
  'River',
  'Rowan',
  'Sage',
  'Skyler',
  'Taylor',
];

const DISPLAY_NAME_POOL_LENGTH = DISPLAY_NAME_POOL.length;

function acquire(usedNames) {
  const used = new Set(
    (usedNames instanceof Set ? Array.from(usedNames) : Array.isArray(usedNames) ? usedNames : [])
      .filter((n) => typeof n === 'string')
      .map((n) => n.toLowerCase())
  );

  for (const candidate of DISPLAY_NAME_POOL) {
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  const fallback = `Panel-${used.size + 1}`;
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(
      `[displayNamePool] pool exhausted (${used.size} used); falling back to ${fallback}`
    );
  }
  return fallback;
}

module.exports = {
  acquire,
  DISPLAY_NAME_POOL,
  DISPLAY_NAME_POOL_LENGTH,
};
