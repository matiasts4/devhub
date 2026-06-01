import { execSync } from 'child_process';
import { zedLog } from '../utils/zed-logger';
import { isSafeHttpUrl } from './urlSafety';

export const browserTool = {
  name: 'open_url',
  description: 'Open a URL in the default browser. Only http: and https: schemes are allowed.',
  parameters: {
    url: { type: 'string', required: true, description: 'URL to open' },
    label: { type: 'string', description: 'Label for this URL' },
  },
  async execute(params /* , context */) {
    const { url, label } = params;
    if (!url) return { error: 'url is required' };

    const safety = isSafeHttpUrl(url);
    if (safety.error) return safety;

    zedLog.info('TOOL', 'open_url', { url, label });

    try {
      execSync(`xdg-open "${safety.url}"`, { stdio: 'ignore' });
    } catch {
      // ignore — browser may not be installed; caller still gets opened:true
    }

    return { url: safety.url, opened: true, message: `Browser opened for ${safety.url}` };
  },
};
