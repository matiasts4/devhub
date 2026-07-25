import { zedLog } from '../utils/zed-logger';
import { isSafeHttpUrl } from './urlSafety';

export const browserTool = {
  name: 'open_url',
  description:
    'Navigate the in-app workspace browser. With focus (default true), enters pizarra canvas mode and places the browser card alongside existing terminal cards (auto-layout). Does NOT open the system browser. Only http: and https: are allowed; bare domains like github.com are normalized to https://.',
  parameters: {
    url: { type: 'string', required: true, description: 'URL to open' },
    label: { type: 'string', description: 'Optional label for the browser pane' },
    focus: {
      type: 'boolean',
      description: 'If true (default), switch the right dock to the browser tab',
    },
  },
  async execute(params /* , context */) {
    const { url, label } = params;
    if (!url) return { error: 'url is required' };

    const safety = isSafeHttpUrl(url);
    if (safety.error) return safety;

    const focus =
      params.focus === undefined || params.focus === null || params.focus === ''
        ? true
        : !['false', '0', 'no'].includes(String(params.focus).trim().toLowerCase()) &&
          (params.focus === true ||
            ['true', '1', 'yes'].includes(String(params.focus).trim().toLowerCase()));

    zedLog.info('TOOL', 'open_url (workspace in-app)', { url, label, focus });

    // Navigation is applied in the client: useZedChat dispatches
    // devhub:zed-open-url when this result arrives (server has no window).
    return {
      opened: true,
      workspace: true,
      in_app: true,
      dock: true,
      url: safety.url,
      label: label ?? null,
      focus,
      message: `Navegador en pizarra → ${safety.url}`,
    };
  },
};

export const closeUrlTool = {
  name: 'close_url',
  description:
    'Cierra el navegador integrado del workspace (vista normal y pizarra). No cierra pestañas del sistema. Requiere confirm: true.',
  parameters: {
    confirm: {
      type: 'boolean',
      description: 'Debe ser true para cerrar el navegador integrado.',
    },
  },
  async execute(params /* , context */) {
    const { confirm } = params || {};
    zedLog.info('TOOL', 'close_url', { confirm });
    if (confirm !== true) {
      return {
        action: 'would close',
        hint: 'call again with confirm: true to close the in-app browser',
      };
    }
    return {
      closed: true,
      workspace: true,
      message: 'Navegador integrado cerrado.',
    };
  },
};
