const {
  buildPizarraViewportKey,
  readPizarraViewport,
  writePizarraViewport,
} = require('../pizarraViewportPersistence.js');

describe('pizarraViewportPersistence', () => {
  const storage = new Map();

  beforeEach(() => {
    storage.clear();
  });

  test('round-trips pan and zoom', () => {
    const key = buildPizarraViewportKey('proj', 'ws1');
    const mock = {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    };
    writePizarraViewport(mock, 'proj', 'ws1', { pan: { x: 120, y: -40 }, zoom: 1.25 });
    expect(readPizarraViewport(mock, 'proj', 'ws1')).toEqual({
      pan: { x: 120, y: -40 },
      zoom: 1.25,
    });
    expect(key).toBe('devhub_pizarra_viewport:proj:ws1');
  });
});
