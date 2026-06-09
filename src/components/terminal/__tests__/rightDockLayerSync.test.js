const {
  applyRightDockLayerBounds,
  shouldDeferRightDockSizePersist,
} = require('../rightDockLayerSync.js');

describe('applyRightDockLayerBounds', () => {
  test('writes rounded pixel left and width on the dock layer', () => {
    const element = { style: { left: '', width: '' } };
    expect(applyRightDockLayerBounds(element, { left: 580.4, width: 380.6 })).toBe(true);
    expect(element.style.left).toBe('580px');
    expect(element.style.width).toBe('381px');
  });

  test('skips DOM writes when bounds are unchanged', () => {
    const element = { style: { left: '580px', width: '381px' } };
    expect(applyRightDockLayerBounds(element, { left: 580.2, width: 380.9 })).toBe(false);
  });

  test('rejects invalid bounds', () => {
    const element = { style: { left: '10px', width: '20px' } };
    expect(applyRightDockLayerBounds(null, { left: 1, width: 2 })).toBe(false);
    expect(applyRightDockLayerBounds(element, { left: 1, width: 0 })).toBe(false);
    expect(element.style.left).toBe('10px');
    expect(element.style.width).toBe('20px');
  });
});

describe('shouldDeferRightDockSizePersist', () => {
  test('defers size persistence only while dragging', () => {
    expect(shouldDeferRightDockSizePersist(true)).toBe(true);
    expect(shouldDeferRightDockSizePersist(false)).toBe(false);
    expect(shouldDeferRightDockSizePersist(undefined)).toBe(false);
  });
});