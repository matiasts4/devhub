/** Client-side listing cache: key = `${base}::${dir}` */
const cache = new Map();
const TTL_MS = 30_000;

export function cacheGet(base, dir) {
  const key = `${base}::${dir ?? ''}`;
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.entries;
}

export function cacheSet(base, dir, entries) {
  const key = `${base}::${dir ?? ''}`;
  cache.set(key, { entries, expiresAt: Date.now() + TTL_MS });
}

export function cacheInvalidate(base, dir) {
  if (dir == null) {
    const prefix = `${base}::`;
    for (const key of [...cache.keys()]) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
    return;
  }
  cache.delete(`${base}::${dir}`);
}

export function cacheInvalidateMany(base, dirs) {
  for (const d of dirs || []) cacheInvalidate(base, d);
}
