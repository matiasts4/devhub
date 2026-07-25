import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { btnDangerStyle, btnPrimaryStyle, btnSecondaryStyle } from '../../chrome/morphology.js';
import { cn } from '@/lib/utils';

const DEVHUB_BUTTON_CHROME = {
  primary:
    'overflow-hidden hover:-translate-x-px hover:-translate-y-px active:translate-x-[var(--chrome-press-offset)] active:translate-y-[var(--chrome-press-offset)]',
  glass:
    'overflow-hidden hover:-translate-x-px hover:-translate-y-px hover:bg-[var(--chrome-control-fill-hover)] active:translate-x-[var(--chrome-press-offset)] active:translate-y-[var(--chrome-press-offset)]',
  ghost:
    'active:translate-x-[var(--chrome-press-offset)] active:translate-y-[var(--chrome-press-offset)]',
};

function getDevhubButtonChromeClasses(kind = 'primary') {
  return DEVHUB_BUTTON_CHROME[kind] || DEVHUB_BUTTON_CHROME.primary;
}

const DEVHUB_BUTTON_SIZE_MAP = {
  sm: 'sm',
  default: 'md',
  toolbar: 'sm',
  lg: 'lg',
  icon: 'sm',
};

const DEVHUB_VARIANTS = new Set(['devhubPrimary', 'devhubGlass', 'devhubGhost', 'devhubDanger']);

function resolveDevhubButtonMorphologySize(size = 'default') {
  return DEVHUB_BUTTON_SIZE_MAP[size] || 'sm';
}

function getDevhubButtonSizeStyle(size) {
  if (size !== 'icon') {
    return null;
  }

  return {
    width: '2rem',
    padding: 0,
  };
}

function getDevhubButtonVariantStyle(variant, size) {
  const morphologySize = resolveDevhubButtonMorphologySize(size);

  if (variant === 'devhubPrimary') {
    return btnPrimaryStyle({ size: morphologySize });
  }

  if (variant === 'devhubGlass') {
    return btnSecondaryStyle({ size: morphologySize });
  }

  if (variant === 'devhubDanger') {
    return btnDangerStyle({ size: morphologySize });
  }

  return null;
}

function isDevhubVariant(variant) {
  return DEVHUB_VARIANTS.has(variant);
}

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 select-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        devhubPrimary: `${getDevhubButtonChromeClasses('primary')} font-semibold uppercase tracking-[0.14em] hover:brightness-110 active:scale-[0.985]`,
        devhubGlass: `${getDevhubButtonChromeClasses('glass')} text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:scale-[0.985]`,
        devhubGhost: `${getDevhubButtonChromeClasses('ghost')} bg-transparent text-[var(--text-muted)] hover:border-[var(--chrome-border-color)] hover:bg-[var(--chrome-control-fill-hover)] hover:text-[var(--text-primary)] active:scale-[0.985]`,
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
        toolbar: 'h-8 px-3.5 text-[11px] gap-1.5 [&_svg]:size-3.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const variantStyle = getDevhubButtonVariantStyle(variant, size);
    const sizeStyle = isDevhubVariant(variant) ? getDevhubButtonSizeStyle(size) : null;
    const mergedStyle =
      variantStyle || sizeStyle ? { ...variantStyle, ...sizeStyle, ...style } : style;
    const resolvedSize = isDevhubVariant(variant) ? undefined : size;

    return React.createElement(asChild ? Slot : 'button', {
      className: cn(buttonVariants({ variant, size: resolvedSize, className })),
      ref,
      style: mergedStyle,
      ...props,
    });
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
export {
  getDevhubButtonChromeClasses,
  getDevhubButtonVariantStyle,
  resolveDevhubButtonMorphologySize,
};
