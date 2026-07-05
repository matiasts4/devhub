/**
 * Panel tab/header labels: prefer human displayName (Chase) over generic
 * "Terminal · …" semantic metadata.
 */

export function buildPanelHeaderDisplay(panelLabel, semanticMetadata) {
  const meta = semanticMetadata && typeof semanticMetadata === 'object' ? semanticMetadata : {};
  const label = typeof panelLabel === 'string' ? panelLabel.trim() : '';
  const looksLikePoolName = label.length > 0 && !/^p\d+$/i.test(label);

  if (meta?.source && meta.source !== 'fallback' && meta.source !== 'display-name') {
    return meta;
  }

  if (looksLikePoolName) {
    const agentHint =
      meta.primary && meta.primary !== 'Terminal' && meta.primary !== label ? meta.primary : null;
    const secondary = agentHint || meta.secondary || null;
    return {
      source: 'display-name',
      primary: label,
      secondary,
      fullText: secondary ? `${label} · ${secondary}` : label,
      swarmRole: meta.swarmRole || null,
    };
  }

  return meta;
}
