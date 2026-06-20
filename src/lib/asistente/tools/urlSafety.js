// URL safety: allow-list of `http:` and `https:` only. Anything else returns
// a structured error result the caller can surface to the model.
//
// Returns either `{ url: string }` on success or `{ error: string }` on
// rejection. The caller is responsible for actually invoking the browser.

export function isSafeHttpUrl(p) {
  let candidate = String(p ?? '').trim();
  if (!candidate) return { error: 'invalid url' };

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(candidate);
  if (hasScheme) {
    if (!/^https?:\/\//i.test(candidate)) {
      return { error: `unsupported scheme: ${candidate.split(':')[0]}:` };
    }
  } else {
    candidate = `https://${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return { error: 'invalid url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: `unsupported scheme: ${parsed.protocol}` };
  }
  return { url: parsed.toString() };
}
