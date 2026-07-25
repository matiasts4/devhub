import { reloadNativeBrowser } from '@/lib/browser/nativeBrowserBridge';

export function reloadBrowserRuntime({ nativeRuntimeActive, nativePanelId, handleReload }) {
  if (!nativeRuntimeActive || !nativePanelId) {
    handleReload?.();
    return Promise.resolve({ nativeRuntimeActive: false, fellBack: true });
  }

  return reloadNativeBrowser({ panelId: nativePanelId }).catch((error) => {
    handleReload?.();
    return {
      nativeRuntimeActive: true,
      fellBack: true,
      error,
    };
  });
}
