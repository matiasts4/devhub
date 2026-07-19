import { PROVIDERS } from '../types.js';

export async function fetchGrokQuota() {
  const res = await fetch(`/api/quota?provider=${PROVIDERS.GROK}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
