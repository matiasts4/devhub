const {
  buttonVariants,
  getDevhubButtonChromeClasses,
  getDevhubButtonVariantStyle,
  resolveDevhubButtonMorphologySize,
} = require('../button.jsx');

describe('devhub button morphology chrome', () => {
  test('maps devhub button variants to morphology token-driven chrome classes and sizes', () => {
    expect(resolveDevhubButtonMorphologySize('toolbar')).toBe('sm');
    expect(resolveDevhubButtonMorphologySize('default')).toBe('md');
    expect(resolveDevhubButtonMorphologySize('lg')).toBe('lg');

    expect(getDevhubButtonChromeClasses('primary')).toContain('overflow-hidden');
    expect(getDevhubButtonChromeClasses('primary')).toContain('hover:-translate-x-px');
    expect(getDevhubButtonChromeClasses('primary')).not.toContain('rounded-full');
    expect(getDevhubButtonChromeClasses('glass')).toContain(
      'hover:bg-[var(--chrome-control-fill-hover)]'
    );
    expect(getDevhubButtonChromeClasses('ghost')).toContain(
      'active:translate-y-[var(--chrome-press-offset)]'
    );
  });

  test('devhub primary variant style comes from morphology factory instead of hardcoded colors', () => {
    const primaryStyle = getDevhubButtonVariantStyle('devhubPrimary', 'toolbar');
    const glassStyle = getDevhubButtonVariantStyle('devhubGlass', 'default');

    expect(primaryStyle.background).toBe('var(--accent-primary)');
    expect(primaryStyle.border).toContain('var(--accent-primary)');
    expect(primaryStyle.color).toBe('var(--primary-foreground, #000)');
    expect(primaryStyle.boxShadow).toBe('3px 3px 0 0 var(--accent-shadow)');
    expect(primaryStyle.height).toBe('2rem');
    expect(primaryStyle.padding).toBe('0 0.75rem');

    expect(glassStyle.background).toBe('var(--chrome-control-fill)');
    expect(glassStyle.boxShadow).toBe('var(--chrome-shadow-control)');
    expect(glassStyle.height).toBe('2.5rem');
  });

  test('buttonVariants keeps shared morphology motion and text intent for devhub variants', () => {
    const primary = buttonVariants({ variant: 'devhubPrimary' });
    const glass = buttonVariants({ variant: 'devhubGlass' });

    expect(primary).toContain('overflow-hidden');
    expect(primary).toContain('tracking-[0.14em]');
    expect(primary).not.toContain('text-[#1b140c]');
    expect(primary).not.toContain('linear-gradient(180deg');
    expect(glass).toContain('var(--chrome-control-fill-hover)');
  });

  test('shared devhub chrome keeps motion treatment without reintroducing hardcoded slab shadows', () => {
    const primaryChrome = getDevhubButtonChromeClasses('primary');
    const glassChrome = getDevhubButtonChromeClasses('glass');
    const primaryVariant = buttonVariants({ variant: 'devhubPrimary' });
    const defaultVariant = buttonVariants({ variant: 'default' });

    expect(primaryChrome).toContain('overflow-hidden');
    expect(primaryChrome).not.toContain('rgba(1,4,9,0.24)');
    expect(glassChrome).not.toContain('rgba(1,4,9,0.22)');
    expect(primaryVariant).toContain('tracking-[0.14em]');
    expect(defaultVariant).not.toContain('tracking-[0.14em]');
  });
});
