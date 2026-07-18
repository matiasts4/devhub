/**
 * @jest-environment node
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { GET } = require('./route');

describe('/api/fs/search', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'devhub-search-'));
    await fs.mkdir(path.join(tmp, 'src'));
    await fs.writeFile(path.join(tmp, 'src', 'TerminalDock.jsx'), 'export default null');
    await fs.writeFile(path.join(tmp, 'README.md'), '# hi');
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test('returns fuzzy hits under base', async () => {
    const request = {
      url: `https://devhub.test/api/fs/search?base=${encodeURIComponent(tmp)}&q=tdock`,
    };
    const response = await GET(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.hits.some((h) => h.rel.includes('TerminalDock.jsx'))).toBe(true);
  });
});
