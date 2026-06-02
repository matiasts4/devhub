import { execSync } from 'child_process';
import { zedLog } from '../utils/zed-logger';
import { isSafeHttpUrl } from './urlSafety';
import { dispatchZedOpenUrl } from '@/components/zedOpenUrlEvent';

export const browserTool = {
  name: 'open_url',
  description:
    'Open a URL in the default browser (xdg-open fallback) AND dispatch a devhub:zed-open-url CustomEvent so the in-app WorkspaceBrowserPane can navigate. Only http: and https: schemes are allowed.',
  parameters: {
    url: { type: 'string', required: true, description: 'URL to open' },
    label: { type: 'string', description: 'Label for this URL' },
    focus: { type: 'boolean', description: 'If true, de-max pizarra to reveal the browser' },
  },
  async execute(params /* , context */) {
    const { url, label, focus = false } = params;
    if (!url) return { error: 'url is required' };

    const safety = isSafeHttpUrl(url);
    if (safety.error) return safety;

    zedLog.info('TOOL', 'open_url', { url, label, focus });

    // In-app navigation event (ZEB-003). dispatchZedOpenUrl is SSR-safe
    // and goes through the helper so dispatch is testable in isolation
    // (ZEB-005). The WorkspaceBrowserPane listener is idempotent on
    // (url, label) so this is safe to call repeatedly.
    dispatchZedOpenUrl({ url: safety.url, label: label ?? null, focus });

    try {
      execSync(`xdg-open "${safety.url}"`, { stdio: 'ignore' });
    } catch {
      // ignore — system browser may not be installed; the in-app pane
      // already navigated, so caller still gets opened:true
    }

    return { url: safety.url, opened: true, message: `Browser opened for ${safety.url}` };
  },
};
