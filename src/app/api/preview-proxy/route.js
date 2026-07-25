import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { NextResponse } from 'next/server';
import { buildPreviewProxyDiagnostic } from '@/lib/browserPreviewDiagnostics';

let cachedOverlaySource = null;
function getOverlaySource() {
  if (cachedOverlaySource) return cachedOverlaySource;
  try {
    const overlayPath = path.join(
      process.cwd(),
      'node_modules/@emergentbase/visual-edits/dist/visual-edit-overlay.js'
    );
    cachedOverlaySource = fs.readFileSync(overlayPath, 'utf8');
    return cachedOverlaySource;
  } catch (e) {
    proxyLog('error', 'failed-to-read-overlay', { error: e.message });
    return '// Overlay load failed';
  }
}

const VISUAL_EDIT_PROXY_LOG_PREFIX = '[devhub][preview-proxy]';

function proxyLog(level, event, details = {}) {
  const payload = buildPreviewProxyDiagnostic(event, details).details;
  if (level === 'error') {
    console.error(`${VISUAL_EDIT_PROXY_LOG_PREFIX} ${event}`, payload);
    return;
  }
  console.warn(`${VISUAL_EDIT_PROXY_LOG_PREFIX} ${event}`, payload);
}

function parseTargetMeta(targetUrl) {
  const raw = String(targetUrl || '').trim();
  if (!raw) {
    return { raw, valid: false, reason: 'empty-url' };
  }

  try {
    const parsed = new URL(raw);
    return {
      raw,
      valid: true,
      href: parsed.href,
      origin: parsed.origin,
      hostname: parsed.hostname,
      port: parsed.port,
      protocol: parsed.protocol,
      pathname: parsed.pathname,
    };
  } catch (error) {
    return {
      raw,
      valid: false,
      reason: 'url-parse-failed',
      message: error?.message || 'unknown parse error',
    };
  }
}

function extractFetchErrorDetails(error) {
  const cause = error?.cause;
  return {
    message: error?.message || 'unknown error',
    name: error?.name || null,
    causeMessage: cause?.message || null,
    code: error?.code || cause?.code || null,
    errno: error?.errno || cause?.errno || null,
    syscall: error?.syscall || cause?.syscall || null,
    address: error?.address || cause?.address || null,
    port: error?.port || cause?.port || null,
  };
}

function firstHeaderValue(value) {
  if (typeof value !== 'string') return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

function resolveAppOrigin(request) {
  const requestUrl = request?.nextUrl ? new URL(request.nextUrl.toString()) : new URL(request.url);
  const getHeader =
    typeof request?.headers?.get === 'function'
      ? (name) => firstHeaderValue(request.headers.get(name))
      : () => null;

  const explicitOrigin = getHeader('origin');
  if (explicitOrigin) {
    try {
      const parsedOrigin = new URL(explicitOrigin);
      if (['http:', 'https:'].includes(parsedOrigin.protocol)) {
        return parsedOrigin.origin;
      }
    } catch {
      // Ignore malformed Origin headers and fall back to forwarded headers / request URL.
    }
  }

  const forwardedProto = getHeader('x-forwarded-proto');
  const forwardedHost = getHeader('x-forwarded-host');
  const host = getHeader('host');
  const protocol = forwardedProto || requestUrl.protocol.replace(/:$/, '');
  const resolvedHost = forwardedHost || host || requestUrl.host;

  return `${protocol}://${resolvedHost}`;
}

function isAllowedLocalhost(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // URL.hostname for IPv6 loopback is "::1" (without brackets).
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function rewriteRootRelativeUrls(html, origin) {
  return html
    .replace(/(src|href|action)=(['"])\/(?!\/)/gi, `$1=$2${origin}/`)
    .replace(/(srcset)=(['"])([^'"]+)(['"])/gi, (_, attr, q1, value, q2) => {
      const rewritten = value
        .split(',')
        .map((part) => {
          const trimmed = part.trim();
          if (!trimmed.startsWith('/')) return trimmed;
          return `${origin}${trimmed}`;
        })
        .join(', ');
      return `${attr}=${q1}${rewritten}${q2}`;
    });
}

/**
 * Builds an inline navigation interceptor script that prevents the proxy iframe from
 * navigating cross-origin to the target origin. Without this, the upstream app's client-side
 * router (Next.js, React Router, etc.) or meta-refresh redirects can navigate the iframe from
 * localhost:3100 (proxy) to localhost:3200 (target), destroying the overlay injected by the proxy.
 *
 * Covers:
 *  - location.assign(url) / location.replace(url)  →  resolves via document.baseURI (respects <base href>)
 *  - history.pushState / replaceState               →  resolves via location.href  (spec-compliant)
 *  - <a> clicks                                     →  uses el.href (browser-resolved absolute URL)
 *
 * Does NOT cover: window.location.href = 'abs-url' setter (non-configurable on Location).
 */
function buildNavInterceptor(appOrigin, targetOrigin) {
  const proxyBase = `${appOrigin}/api/preview-proxy/?url=`;
  const safeProxyBase = JSON.stringify(proxyBase);
  const safeTargetOrigin = JSON.stringify(targetOrigin);

  return (
    `<script data-devhub-nav-interceptor>(function(H){` +
    `var P=${safeProxyBase},T=${safeTargetOrigin};` +
    `console.log('[devhub][nav-interceptor] initialized', {proxyBase:P,targetOrigin:T});` +
    `function rLoc(u){` +
    `if(!u || typeof u !== 'string' || u.startsWith(P) || u.startsWith('data:') || u.startsWith('blob:')) return u;` +
    `try {` +
    `var x = new URL(u, window.location.href);` +
    `if (x.origin === T || x.origin === window.location.origin) {` +
    `var r = P + encodeURIComponent(x.pathname + x.search + x.hash);` +
    `console.log('[devhub][nav-interceptor] rewriting', {from:u,to:r});` +
    `return r;` +
    `}` +
    `} catch(e) {}` +
    `return u;` +
    `}` +
    `if(H){var hp=H.prototype,ops=hp.pushState,ors=hp.replaceState;` +
    `hp.pushState=function(s,t,u){` +
    `var nu = u ? rLoc(u) : u;` +
    `console.log('[devhub][nav-interceptor] pushState', {original:u,rewritten:nu});` +
    `return ops.call(this,s,t,nu);` +
    `};` +
    `hp.replaceState=function(s,t,u){` +
    `var nu = u ? rLoc(u) : u;` +
    `console.log('[devhub][nav-interceptor] replaceState', {original:u,rewritten:nu});` +
    `return ors.call(this,s,t,nu);` +
    `};}` +
    `window.addEventListener('click', function(e){` +
    `var a = e.target.closest('a');` +
    `if(a && a.href && !a.target && (a.origin === window.location.origin || a.origin === T)) {` +
    `var nu = rLoc(a.href);` +
    `if(nu !== a.href) { e.preventDefault(); e.stopPropagation(); window.location.href = nu; }` +
    `}` +
    `}, true);` +
    `})(window.History);</script>`
  );
}

function collectEscapeTargets(html, targetUrl) {
  const riskTargets = [];
  const baseOrigin = new URL(targetUrl).origin;
  const matches = html.matchAll(/(?:href|src|action)=(['"])(.*?)\1/gi);

  for (const match of matches) {
    const candidate = String(match[2] || '').trim();
    if (
      !candidate ||
      candidate.startsWith('#') ||
      candidate.startsWith('data:') ||
      candidate.startsWith('blob:')
    ) {
      continue;
    }

    try {
      const resolved = new URL(candidate, targetUrl);
      if (resolved.origin !== baseOrigin) {
        riskTargets.push(resolved.href);
      }
    } catch {
      // Ignore malformed candidate URLs. Rewriter will preserve them as-is.
    }
  }

  return riskTargets;
}

function injectPreviewBase(html, targetUrl, appOrigin) {
  const parsed = new URL(targetUrl);
  const baseHref = parsed.href;
  const origin = parsed.origin;
  const escapeTargets = collectEscapeTargets(html, targetUrl);

  if (escapeTargets.length > 0) {
    proxyLog('warn', 'proxy-navigation-escape-risk', {
      reason: 'cross-origin-navigation-target',
      target: parseTargetMeta(targetUrl),
      escapeTargets,
    });
  }

  // Remove meta-refresh tags: they cause declarative cross-origin redirects that bypass JS interception.
  const withoutMetaRefresh = html.replace(
    /<meta[^>]+http-equiv=['"]?refresh['"]?[^>]*\/?>/gi,
    '<!-- meta-refresh-removed-by-devhub -->'
  );

  const withRewrites = rewriteRootRelativeUrls(withoutMetaRefresh, origin);
  const overlaySource = getOverlaySource();
  const navInterceptor = buildNavInterceptor(appOrigin, origin);

  const injection = `
<base href="${baseHref}">
<meta name="devhub-preview-proxy" content="1">
${navInterceptor}
<script data-devhub-overlay>
${overlaySource}
</script>`.trim();

  if (/<head[^>]*>/i.test(withRewrites)) {
    return withRewrites.replace(/<head([^>]*)>/i, `<head$1>${injection}`);
  }

  return `<!doctype html><html><head>${injection}</head><body>${withRewrites}</body></html>`;
}

export { injectPreviewBase };

export async function GET(request) {
  const target = request.nextUrl.searchParams.get('url');
  const targetMeta = parseTargetMeta(target);
  const appOrigin = resolveAppOrigin(request);
  proxyLog('debug', 'request-received', {
    requestUrl: request.url,
    target: targetMeta,
    appOrigin,
  });

  if (!target || !isAllowedLocalhost(target)) {
    proxyLog('warn', 'request-rejected', {
      reason: 'target-not-allowed',
      target: targetMeta,
    });
    return NextResponse.json(
      { error: 'Invalid target URL. Only localhost targets are allowed.' },
      { status: 400 }
    );
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    proxyLog('debug', 'upstream-response', {
      target: targetMeta,
      status: upstream.status,
      ok: upstream.ok,
      contentType: upstream.headers.get('content-type') || null,
    });
  } catch (error) {
    const errorDetails = extractFetchErrorDetails(error);
    proxyLog('error', 'upstream-fetch-failed', {
      target: targetMeta,
      error: errorDetails,
    });
    return NextResponse.json(
      {
        error: 'Failed to fetch preview target',
        detail: errorDetails.message,
        code: errorDetails.code,
        address: errorDetails.address,
        port: errorDetails.port,
      },
      { status: 502 }
    );
  }

  const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';

  if (contentType.includes('text/html')) {
    const html = await upstream.text();
    let body;

    try {
      body = injectPreviewBase(html, target, appOrigin);
    } catch (error) {
      proxyLog('warn', 'html-rewrite-failed', {
        reason: 'html-rewrite-failed',
        target: targetMeta,
        error: extractFetchErrorDetails(error),
      });
      return NextResponse.json(
        {
          error: 'Failed to rewrite preview HTML',
          detail: error?.message || 'unknown rewrite error',
        },
        { status: 502 }
      );
    }

    proxyLog('info', 'html-rewritten-with-overlay', {
      target: targetMeta,
      status: upstream.status,
      hadHeadTag: /<head[^>]*>/i.test(html),
      contentLength: body.length,
      appOrigin,
    });
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  const data = await upstream.arrayBuffer();
  proxyLog('info', 'binary-relay', {
    target: targetMeta,
    status: upstream.status,
    contentType,
    bytes: data.byteLength,
  });
  return new NextResponse(data, {
    status: upstream.status,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  });
}
