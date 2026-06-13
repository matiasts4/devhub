'use client';

/**
 * MotionSkeleton — shimmer loading placeholder built on shadcn Skeleton.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function MotionSkeleton({ className, ...props }) {
  return (
    <Skeleton
      className={cn(
        'bg-primary/10 motion-safe:animate-pulse',
        className
      )}
      {...props}
    />
  );
}

/** Grid of skeleton blocks for canvas/panel loading states. */
export function MotionSkeletonGrid({ rows = 3, className }) {
  return (
    <div className={cn('flex flex-col gap-3 p-6', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <MotionSkeleton
          key={i}
          className="h-4"
          style={{ width: `${88 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

export default MotionSkeleton;