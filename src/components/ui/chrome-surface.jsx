import * as React from 'react';

import { cn } from '@/lib/utils';

export function chromeSurfaceStyle({
  surface = 'panel',
  emphasized = false,
  tone = 'neutral',
} = {}) {
  if (surface === 'pill') {
    return {
      background:
        tone === 'accent' ? 'var(--chrome-panel-fill-emphasis)' : 'var(--chrome-control-fill)',
      borderColor:
        tone === 'accent'
          ? 'color-mix(in srgb, var(--accent-primary) 24%, var(--chrome-border-color))'
          : 'var(--chrome-border-color)',
      borderWidth: 'var(--chrome-border-width)',
      borderRadius: 'var(--chrome-radius-control)',
      boxShadow: 'var(--chrome-shadow-control)',
      color: tone === 'accent' ? 'var(--text-primary)' : 'var(--text-muted)',
    };
  }

  return {
    background: emphasized ? 'var(--chrome-panel-fill-emphasis)' : 'var(--chrome-panel-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    borderRadius: 'var(--chrome-radius-panel)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export const ChromeSurface = React.forwardRef(
  (
    {
      asChild = false,
      as: Comp = 'div',
      className,
      surface = 'panel',
      emphasized = false,
      tone = 'neutral',
      children,
      style,
      ...props
    },
    ref
  ) => {
    const Element = asChild ? React.Fragment : Comp;

    if (asChild) {
      return React.cloneElement(React.Children.only(children), {
        ...props,
        ref,
        'data-chrome-surface': surface,
        'data-emphasized': emphasized ? 'true' : 'false',
        className: cn(children.props.className, className),
        style: {
          ...chromeSurfaceStyle({ surface, emphasized, tone }),
          ...style,
          ...children.props.style,
        },
      });
    }

    return (
      <Element
        ref={ref}
        data-chrome-surface={surface}
        data-emphasized={emphasized ? 'true' : 'false'}
        className={cn('border', className)}
        style={{
          ...chromeSurfaceStyle({ surface, emphasized, tone }),
          ...style,
        }}
        {...props}
      >
        {children}
      </Element>
    );
  }
);

ChromeSurface.displayName = 'ChromeSurface';
