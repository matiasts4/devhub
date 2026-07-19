import { PROVIDERS } from '../types.js';

export async function fetchCodexQuota() {
  const res = await fetch(`/api/quota?provider=${PROVIDERS.CODEX}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
