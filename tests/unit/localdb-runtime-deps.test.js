describe('localDb runtime dependencies', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('localDb can be required and opens a database without throwing path/fs reference errors', () => {
    jest.doMock('../../src/lib/db/pathResolver', () => ({
      resolveDbPath: jest.fn(() => '/tmp/devhub-localdb-runtime-test.db'),
    }));

    const localDb = require('../../src/lib/db/localDb');

    expect(() => {
      const db = localDb.getDb();
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'").get();
      expect(row.name).toBe('projects');
      localDb.closeDb();
    }).not.toThrow();
  });
});
