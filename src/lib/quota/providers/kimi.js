import { PROVIDERS } from '../types.js';

export async function fetchKimiQuota() {
  const res = await fetch(`/api/quota?provider=${PROVIDERS.KIMI}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
