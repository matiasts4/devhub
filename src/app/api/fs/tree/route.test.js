const mockReaddir = jest.fn();
const mockAccess = jest.fn();
const TREE_CACHE_KEY = '__DEVHUB_FS_TREE_CACHE__';

jest.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    readdir: mockReaddir,
    access: mockAccess,
  },
  readdir: mockReaddir,
  access: mockAccess,
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({ _data: data, _status: init?.status || 200 })),
  },
}));

function createDirent(name, isDirectory) {
  return {
    name,
    isDirectory: () => isDirectory,
  };
}

describe('GET /api/fs/tree', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockAccess.mockResolvedValue(undefined);
    delete globalThis[TREE_CACHE_KEY];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete globalThis[TREE_CACHE_KEY];
  });

  it('skips generated directories and caches the latest tree briefly', async () => {
    mockReaddir
      .mockResolvedValueOnce([
        createDirent('src', true),
        createDirent('node_modules', true),
        createDirent('.next', true),
        createDirent('README.md', false),
      ])
      .mockResolvedValueOnce([
        createDirent('App.jsx', false),
      ]);

    const { GET } = await import('./route.js');
    const request = { url: 'https://devhub.test/api/fs/tree?base=%2Fworkspace%2Fdevhub' };

    await GET(request);
    await GET(request);

    const { NextResponse } = await import('next/server');
    const [[firstPayload], [secondPayload]] = NextResponse.json.mock.calls;

    expect(mockAccess).toHaveBeenCalledTimes(2);
    expect(mockReaddir).toHaveBeenCalledTimes(2);
    expect(firstPayload).toEqual({
      root: '/workspace/devhub',
      tree: [
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          children: [
            {
              name: 'App.jsx',
              path: 'src/App.jsx',
              type: 'file',
            },
          ],
        },
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
        },
      ],
    });
    expect(secondPayload).toEqual(firstPayload);
  });

  it('refreshes the cached tree after the brief cache window expires', async () => {
    let currentTime = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

    mockReaddir
      .mockResolvedValueOnce([
        createDirent('src', true),
        createDirent('README.md', false),
      ])
      .mockResolvedValueOnce([
        createDirent('App.jsx', false),
      ])
      .mockResolvedValueOnce([
        createDirent('lib', true),
        createDirent('README.md', false),
      ])
      .mockResolvedValueOnce([
        createDirent('tree.js', false),
      ]);

    const { GET } = await import('./route.js');
    const request = { url: 'https://devhub.test/api/fs/tree?base=%2Fworkspace%2Fdevhub' };

    await GET(request);

    currentTime += 100;
    await GET(request);

    currentTime += 600_000;
    await GET(request);

    const { NextResponse } = await import('next/server');
    const [[firstPayload], [secondPayload], [thirdPayload]] = NextResponse.json.mock.calls;

    expect(mockAccess).toHaveBeenCalledTimes(3);
    expect(mockReaddir).toHaveBeenCalledTimes(4);
    expect(secondPayload).toEqual(firstPayload);
    expect(thirdPayload).toEqual({
      root: '/workspace/devhub',
      tree: [
        {
          name: 'lib',
          path: 'lib',
          type: 'directory',
          children: [
            {
              name: 'tree.js',
              path: 'lib/tree.js',
              type: 'file',
            },
          ],
        },
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
        },
      ],
    });
  });
});
