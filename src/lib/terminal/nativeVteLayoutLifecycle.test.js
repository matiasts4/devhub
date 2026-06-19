import {
  _resetNativeVteLayoutLifecycleForTests,
  cancelNativeVteLayoutHide,
  consumeHiddenNativeVteLease,
  deferNativeVteLayoutHide,
  hasHiddenNativeVteLease,
  markNativeVteLeaseHidden,
} from './nativeVteLayoutLifecycle';

describe('nativeVteLayoutLifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    _resetNativeVteLayoutLifecycleForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    _resetNativeVteLayoutLifecycleForTests();
  });

  test('cancelNativeVteLayoutHide prevents deferred hide from marking lease hidden', () => {
    const hideFn = jest.fn();
    deferNativeVteLayoutHide('p1', hideFn, 48);
    expect(cancelNativeVteLayoutHide('p1')).toBe(true);

    jest.advanceTimersByTime(48);
    expect(hideFn).not.toHaveBeenCalled();
    expect(hasHiddenNativeVteLease('p1')).toBe(false);
  });

  test('deferred hide marks lease hidden after timer fires', () => {
    const hideFn = jest.fn();
    deferNativeVteLayoutHide('p1', hideFn, 48);

    jest.advanceTimersByTime(48);
    expect(hideFn).toHaveBeenCalledTimes(1);
    expect(hasHiddenNativeVteLease('p1')).toBe(true);
    expect(consumeHiddenNativeVteLease('p1')).toBe(true);
    expect(hasHiddenNativeVteLease('p1')).toBe(false);
  });

  test('markNativeVteLeaseHidden is consumable once', () => {
    markNativeVteLeaseHidden('p2');
    expect(consumeHiddenNativeVteLease('p2')).toBe(true);
    expect(consumeHiddenNativeVteLease('p2')).toBe(false);
  });
});
