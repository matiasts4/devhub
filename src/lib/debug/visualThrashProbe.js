/**
 * Visual thrash probe — catches "CSS disappeared / sidebar collapsed to icons
 * at the bottom / plain HTML for a few ms" events that never become TypeErrors.
 *
 * Formal crash.log only sees JS exceptions. This probe samples layout + CSS
 * state and POSTs soft evidence to /api/client-log as source `visual-thrash`.
 *
 * IMPORTANT: Root layout's ClientErrorLogger mounts once. After pulling this
 * module you need a full hard refresh (or app restart) — HMR alone may not
 * re-run the effect. Look for `probe-started` in browser.log to confirm.
 */

const ENDPOINT = '/api/client-log';
const IDLE_SAMPLE_MS = 100;
const HOT_SAMPLE_MS = 32;
const HOT_WINDOW_MS = 1500;
const COALESCE_MS = 400;
const STYLE_SHEET_DROP_RATIO = 0.45;

function send(level, message, details) {
  try {
    const body = {
      level,
      message,
      details,
      source: 'visual-thrash',
      ts: Date.now(),
      href: typeof window !== 'undefined' ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    };
    const payload = JSON.stringify(body);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(
        ENDPOINT,
        new Blob([payload], { type: 'application/json' })
      );
      if (ok) return;
    }
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never throw from probe
  }
}

function countStyleSheets() {
  try {
    return document.styleSheets?.length || 0;
  } catch {
    return 0;
  }
}

function countStylesheetLinks() {
  try {
    return document.querySelectorAll('link[rel="stylesheet"]').length;
  } catch {
    return 0;
  }
}

function listStylesheetHrefs() {
  try {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((el) => {
        const href = el.getAttribute('href') || el.href || '';
        return String(href).slice(-80);
      })
      .slice(0, 12);
  } catch {
    return [];
  }
}

function readCssVar(name) {
  try {
    return String(
      getComputedStyle(document.documentElement).getPropertyValue(name) || ''
    ).trim();
  } catch {
    return '';
  }
}

function sampleSidebar() {
  const el =
    document.querySelector('[data-testid="workspace-sidebar"]') ||
    document.querySelector('[data-testid="sidebar"]');
  if (!el) return null;
  try {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const svg = el.querySelector('svg');
    let iconW = 0;
    let iconH = 0;
    if (svg) {
      const ir = svg.getBoundingClientRect();
      iconW = Math.round(ir.width * 10) / 10;
      iconH = Math.round(ir.height * 10) / 10;
    }
    // Labels present when expanded; crater often keeps icons but drops text styling.
    const label = el.querySelector('span, p, a span');
    let labelVisible = false;
    let labelFontPx = 0;
    if (label) {
      const ls = getComputedStyle(label);
      const lr = label.getBoundingClientRect();
      labelVisible =
        ls.display !== 'none' &&
        ls.visibility !== 'hidden' &&
        Number(ls.opacity || 1) > 0.05 &&
        lr.width > 2 &&
        lr.height > 2;
      labelFontPx = Math.round(parseFloat(ls.fontSize) || 0);
    }
    return {
      display: cs.display,
      flexDirection: cs.flexDirection,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      opacity: cs.opacity,
      visibility: cs.visibility,
      iconW,
      iconH,
      labelVisible,
      labelFontPx,
    };
  } catch {
    return null;
  }
}

function sampleRootChrome() {
  try {
    const html = document.documentElement;
    const body = document.body;
    const htmlCs = getComputedStyle(html);
    const bodyCs = getComputedStyle(body);
    // Known Tailwind utility on app shell — if flex is lost, CSS likely dropped.
    const shell =
      document.querySelector('.bg-surface-app') ||
      document.querySelector('[data-terminal-container]') ||
      body;
    const shellCs = shell ? getComputedStyle(shell) : null;
    return {
      htmlFont: (htmlCs.fontFamily || '').slice(0, 64),
      bodyFont: (bodyCs.fontFamily || '').slice(0, 64),
      bodyBg: (bodyCs.backgroundColor || '').slice(0, 32),
      shellDisplay: shellCs?.display || null,
      shellFont: (shellCs?.fontFamily || '').slice(0, 64),
    };
  } catch {
    return null;
  }
}

function isGenericFont(font) {
  const f = String(font || '').toLowerCase();
  if (!f) return true;
  // Browser default serif when app CSS is gone is a classic FOUC signal.
  // system-ui / sans-serif alone can still appear if only the FOUC shield
  // remains — treat pure Times as the hard FOUC; generic sans is softer.
  return f.includes('times new roman') || f === 'times' || f.startsWith('times,');
}

function isHardFoucFont(font) {
  const f = String(font || '').toLowerCase();
  return f.includes('times new roman') || f === 'serif' || f.startsWith('times');
}

/**
 * @returns {{ stop: () => void }}
 */
export function installVisualThrashProbe() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { stop() {} };
  }
  if (window.__devhubVisualThrashProbe) {
    return window.__devhubVisualThrashProbe;
  }

  let last = {
    sheets: countStyleSheets(),
    links: countStylesheetLinks(),
    surface: readCssVar('--surface-app'),
    text: readCssVar('--text-primary'),
    accent: readCssVar('--accent-primary'),
    sidebar: sampleSidebar(),
    chrome: sampleRootChrome(),
  };
  let lastReportAt = 0;
  let lastKindAt = new Map();
  let hotUntil = 0;
  let timer = null;
  let rafId = 0;
  let stopped = false;
  let longTaskCount = 0;

  const report = (kind, payload, { force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastReportAt < COALESCE_MS) {
      const prevKindTs = lastKindAt.get(kind) || 0;
      if (now - prevKindTs < COALESCE_MS) return;
    }
    lastReportAt = now;
    lastKindAt.set(kind, now);
    send('warn', `[devhub][visual-thrash] ${kind}`, {
      kind,
      ...payload,
      path: window.location?.pathname || null,
      hash: window.location?.hash || null,
      longTaskCount,
    });
    try {
      // No [devhub] prefix → avoids console interceptor double-POST.
      console.warn('visual-thrash', kind, payload);
    } catch {
      // ignore
    }
  };

  const tick = () => {
    if (stopped) return;
    const next = {
      sheets: countStyleSheets(),
      links: countStylesheetLinks(),
      surface: readCssVar('--surface-app'),
      text: readCssVar('--text-primary'),
      accent: readCssVar('--accent-primary'),
      sidebar: sampleSidebar(),
      chrome: sampleRootChrome(),
    };

    if (last.sheets > 2 && next.sheets <= Math.floor(last.sheets * (1 - STYLE_SHEET_DROP_RATIO))) {
      report('stylesheet-drop', {
        fromSheets: last.sheets,
        toSheets: next.sheets,
        fromLinks: last.links,
        toLinks: next.links,
      });
    }
    if (last.links > 0 && next.links === 0) {
      report('stylesheet-links-gone', { fromLinks: last.links, toLinks: next.links });
    }

    const foucContext = () => ({
      sheets: next.sheets,
      links: next.links,
      prevSheets: last.sheets,
      prevLinks: last.links,
      hrefs: listStylesheetHrefs(),
    });

    if (last.surface && !next.surface) {
      report('css-var-missing', {
        var: '--surface-app',
        had: last.surface,
        ...foucContext(),
      });
    }
    if (last.text && !next.text) {
      report('css-var-missing', {
        var: '--text-primary',
        had: last.text,
        ...foucContext(),
      });
    }
    if (last.accent && !next.accent) {
      report('css-var-missing', {
        var: '--accent-primary',
        had: last.accent,
        ...foucContext(),
      });
    }

    // Font falls back to browser serif → full CSS FOUC (shield failed or absent)
    if (
      last.chrome?.bodyFont &&
      !isHardFoucFont(last.chrome.bodyFont) &&
      next.chrome?.bodyFont &&
      isHardFoucFont(next.chrome.bodyFont)
    ) {
      report('font-fallback-fouc', {
        from: last.chrome,
        to: next.chrome,
        ...foucContext(),
      });
    }

    if (last.sidebar && next.sidebar) {
      const wasFlex = String(last.sidebar.display).includes('flex');
      const nowFlex = String(next.sidebar.display).includes('flex');
      if (wasFlex && !nowFlex) {
        report('sidebar-flex-lost', { from: last.sidebar, to: next.sidebar });
      }
      if (
        last.sidebar.width >= 120 &&
        next.sidebar.width > 0 &&
        next.sidebar.width < 40 &&
        next.sidebar.height > 200
      ) {
        report('sidebar-width-collapse', { from: last.sidebar, to: next.sidebar });
      }
      const fromOp = Number(last.sidebar.opacity);
      const toOp = Number(next.sidebar.opacity);
      if (Number.isFinite(fromOp) && Number.isFinite(toOp) && fromOp >= 0.9 && toOp <= 0.15) {
        report('sidebar-opacity-blink', { from: last.sidebar, to: next.sidebar });
      }

      // Class D aesthetic crater: background/shield OK but icons inflate and/or
      // labels vanish — matches user report "solo iconos, se desorganiza, se recupera".
      const iconInflated =
        last.sidebar.iconW > 0 &&
        next.sidebar.iconW > 0 &&
        last.sidebar.iconW <= 16 &&
        next.sidebar.iconW >= 20;
      const labelsDropped = last.sidebar.labelVisible === true && next.sidebar.labelVisible === false;
      if (iconInflated || labelsDropped) {
        report('aesthetic-crater', {
          iconInflated,
          labelsDropped,
          from: last.sidebar,
          to: next.sidebar,
          ...foucContext(),
        });
      }
    }

    // Shell display lost (app root no longer flex/block as expected)
    // Only flag shell-flex-lost when it looks like a real unstyled FOUC.
    // With the FOUC shield, utility CSS can drop flex on a div while fonts/bg
    // stay correct — that is noise, not the "HTML plain" crash the user sees.
    if (
      last.chrome?.shellDisplay &&
      last.chrome.shellDisplay.includes('flex') &&
      next.chrome?.shellDisplay &&
      !String(next.chrome.shellDisplay).includes('flex')
    ) {
      const hardFont = isHardFoucFont(next.chrome?.bodyFont || next.chrome?.htmlFont);
      const bgGone =
        last.chrome?.bodyBg &&
        last.chrome.bodyBg !== 'rgba(0, 0, 0, 0)' &&
        (!next.chrome?.bodyBg ||
          next.chrome.bodyBg === 'rgba(0, 0, 0, 0)' ||
          next.chrome.bodyBg === 'rgb(255, 255, 255)');
      if (hardFont || bgGone) {
        report('shell-flex-lost', {
          from: last.chrome,
          to: next.chrome,
          sheets: next.sheets,
          links: next.links,
          prevSheets: last.sheets,
          prevLinks: last.links,
          hardFont,
          bgGone,
        });
      } else {
        // Soft structural blip under shield — log quieter for diagnostics only
        report('shell-flex-blip-shielded', {
          fromDisplay: last.chrome.shellDisplay,
          toDisplay: next.chrome.shellDisplay,
          sheets: next.sheets,
          prevSheets: last.sheets,
        });
      }
    }

    last = {
      sheets: next.sheets,
      links: next.links,
      surface: next.surface || last.surface,
      text: next.text || last.text,
      accent: next.accent || last.accent,
      sidebar: next.sidebar || last.sidebar,
      chrome: next.chrome || last.chrome,
    };
  };

  const schedule = () => {
    if (stopped) return;
    if (timer) window.clearTimeout(timer);
    const hot = Date.now() < hotUntil;
    const delay = hot ? HOT_SAMPLE_MS : IDLE_SAMPLE_MS;
    timer = window.setTimeout(() => {
      tick();
      // During hot window also use rAF for sub-frame capture of blinks.
      if (Date.now() < hotUntil) {
        rafId = window.requestAnimationFrame(() => {
          tick();
          schedule();
        });
      } else {
        schedule();
      }
    }, delay);
  };

  const markHot = (reason) => {
    hotUntil = Date.now() + HOT_WINDOW_MS;
    report('hot-window', { reason }, { force: false });
    tick();
  };

  // Correlate with terminal layout storms (workspace switch, pizarra, etc.)
  const onLayoutSettled = (event) => {
    const reason = event?.detail?.reason || 'layout-settled';
    markHot(reason);
  };
  window.addEventListener('devhub:terminal-layout-settled', onLayoutSettled);

  // Long tasks often coincide with "frame without CSS" perception.
  let po = null;
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskCount += 1;
          if (entry.duration >= 80) {
            markHot('longtask');
            report('longtask', {
              duration: Math.round(entry.duration),
              name: entry.name || null,
            });
          }
        }
      });
      po.observe({ entryTypes: ['longtask'] });
    }
  } catch {
    po = null;
  }

  let mo = null;
  try {
    mo = new MutationObserver(() => {
      if (Date.now() < hotUntil) tick();
    });
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'disabled', 'media'],
    });
  } catch {
    mo = null;
  }

  const handle = {
    stop() {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      timer = null;
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      mo?.disconnect();
      mo = null;
      try {
        po?.disconnect();
      } catch {
        // ignore
      }
      po = null;
      window.removeEventListener('devhub:terminal-layout-settled', onLayoutSettled);
      if (window.__devhubVisualThrashProbe === handle) {
        delete window.__devhubVisualThrashProbe;
      }
    },
  };
  window.__devhubVisualThrashProbe = handle;

  // Proof the probe is alive in this session (must appear after hard refresh).
  report(
    'probe-started',
    {
      sheets: last.sheets,
      links: last.links,
      surface: last.surface ? 'set' : 'empty',
      hasSidebar: Boolean(last.sidebar),
      bodyFont: last.chrome?.bodyFont || null,
    },
    { force: true }
  );
  schedule();
  return handle;
}
