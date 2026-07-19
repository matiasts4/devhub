import { PROVIDERS } from '../types.js';

export async function fetchOpenCodeQuota() {
  const res = await fetch(`/api/quota?provider=${PROVIDERS.OPENCODE}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
