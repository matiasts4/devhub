import { PROVIDERS } from '../types.js';

export async function fetchQoderQuota() {
  const res = await fetch(`/api/quota?provider=${PROVIDERS.QODER}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
