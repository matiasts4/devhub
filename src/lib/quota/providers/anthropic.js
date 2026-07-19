import { PROVIDERS } from '../types.js';

export async function fetchAnthropicQuota() {
  const res = await fetch(`/api/quota?provider=${PROVIDERS.CLAUDE}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
