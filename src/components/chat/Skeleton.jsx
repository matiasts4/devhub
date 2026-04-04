/**
 * Skeleton — reusable shimmer loading components.
 * Uses CSS vars exclusively for all colors.
 */

// Core shimmer animation via inline style (no global CSS needed)
const shimmerStyle = {
  background:
    'linear-gradient(90deg, var(--surface-hover) 25%, var(--surface-elevated) 50%, var(--surface-hover) 75%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
};

export function Skeleton({ className = '', style = {}, ...props }) {
  return (
    <div
      className={`rounded-md ${className}`}
      style={{
        ...shimmerStyle,
        background: `linear-gradient(90deg, var(--surface-hover) 25%, var(--surface-elevated) 50%, var(--surface-hover) 75%)`,
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
        ...style,
      }}
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }) {
  const widths = ['100%', '85%', '60%'];
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 rounded" style={{ width: widths[i % widths.length] }} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div
      className={`rounded-xl p-4 space-y-3 ${className}`}
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center gap-3">
        <SkeletonAvatar />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonAvatar({ className = '', size = 36 }) {
  return (
    <Skeleton
      className={`rounded-full ${className}`}
      style={{ width: size, height: size, minWidth: size }}
    />
  );
}
