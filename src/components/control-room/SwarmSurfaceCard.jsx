import React from 'react';

import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface';

export function surfaceCardStyle({ emphasized = false } = {}) {
  return chromeSurfaceStyle({ surface: 'panel', emphasized });
}

export function SurfaceCard({ children, className = '', emphasized = false }) {
  return (
    <ChromeSurface className={className} emphasized={emphasized} surface="panel">
      {children}
    </ChromeSurface>
  );
}

export function SurfacePill({ children, tone = 'neutral' }) {
  return (
    <ChromeSurface as="span" className="px-2.5 py-1 text-xs" surface="pill" tone={tone}>
      {children}
    </ChromeSurface>
  );
}
