/**
 * @jest-environment node
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { POST } = require('./route');

function makeRequest(body) {
  return {
    json: async () => body,
  };
}

describe('/api/fs/mutate', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'devhub-mutate-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test('creates a file inside the sandbox and rejects escapes', async () => {
    const ok = await POST(makeRequest({ base: tmp, action: 'create_file', path: 'notes/a.txt' }));
    expect(ok.status).toBe(200);
    const content = await fs.readFile(path.join(tmp, 'notes', 'a.txt'), 'utf8');
    expect(content).toBe('');

    const bad = await POST(
      makeRequest({ base: tmp, action: 'create_file', path: '../outside.txt' })
    );
    expect(bad.status).toBe(400);
  });

  test('renames and deletes paths under base', async () => {
    await fs.writeFile(path.join(tmp, 'old.txt'), 'hi');
    const renamed = await POST(
      makeRequest({ base: tmp, action: 'rename', from: 'old.txt', to: 'new.txt' })
    );
    expect(renamed.status).toBe(200);
    expect(await fs.readFile(path.join(tmp, 'new.txt'), 'utf8')).toBe('hi');

    const deleted = await POST(makeRequest({ base: tmp, action: 'delete', path: 'new.txt' }));
    expect(deleted.status).toBe(200);
    await expect(fs.access(path.join(tmp, 'new.txt'))).rejects.toBeTruthy();
  });
});
