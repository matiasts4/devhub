import { PROVIDERS } from '../types.js';

export async function fetchAntigravityQuota() {
  const res = await fetch(`/api/quota?provider=${PROVIDERS.ANTIGRAVITY}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
