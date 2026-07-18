/**
 * @jest-environment node
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { POST } = require('./route');

describe('/api/fs/tree/batch', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'devhub-batch-'));
    await fs.mkdir(path.join(tmp, 'src'));
    await fs.writeFile(path.join(tmp, 'src', 'a.js'), '1');
    await fs.writeFile(path.join(tmp, 'README.md'), '#');
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test('returns listings for root and nested dir in one call', async () => {
    const response = await POST({
      json: async () => ({ base: tmp, dirs: ['', 'src'] }),
    });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.listings[''].some((n) => n.name === 'src')).toBe(true);
    expect(data.listings.src.some((n) => n.name === 'a.js')).toBe(true);
  });
});
