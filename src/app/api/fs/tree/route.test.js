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

  it('returns a shallow root listing by default and skips heavy directories', async () => {
    mockReaddir.mockResolvedValueOnce([
      createDirent('src', true),
      createDirent('node_modules', true),
      createDirent('.next', true),
      createDirent('graphify-out', true),
      createDirent('README.md', false),
    ]);

    const { GET } = await import('./route.js');
    const request = { url: 'https://devhub.test/api/fs/tree?base=%2Fworkspace%2Fdevhub' };

    await GET(request);
    await GET(request);

    const { NextResponse } = await import('next/server');
    const [[firstPayload], [secondPayload]] = NextResponse.json.mock.calls;

    expect(mockAccess).toHaveBeenCalledTimes(2);
    expect(mockReaddir).toHaveBeenCalledTimes(1);
    expect(firstPayload).toEqual({
      root: expect.any(String),
      dir: '',
      mode: 'shallow',
      cached: false,
      tree: [
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          children: null,
        },
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
        },
      ],
    });
    expect(secondPayload.cached).toBe(true);
    expect(secondPayload.tree).toEqual(firstPayload.tree);
  });

  it('lists a single directory when dir is provided', async () => {
    mockReaddir.mockResolvedValueOnce([
      createDirent('App.jsx', false),
      createDirent('components', true),
    ]);

    const { GET } = await import('./route.js');
    const request = {
      url: 'https://devhub.test/api/fs/tree?base=%2Fworkspace%2Fdevhub&dir=src',
    };

    await GET(request);

    const { NextResponse } = await import('next/server');
    const [[payload]] = NextResponse.json.mock.calls;

    expect(mockReaddir).toHaveBeenCalledTimes(1);
    expect(payload).toEqual({
      root: expect.any(String),
      dir: 'src',
      mode: 'shallow',
      cached: false,
      tree: [
        {
          name: 'components',
          path: 'src/components',
          type: 'directory',
          children: null,
        },
        {
          name: 'App.jsx',
          path: 'src/App.jsx',
          type: 'file',
        },
      ],
    });
  });

  it('builds a recursive tree when recursive=1 for scaffolding consumers', async () => {
    mockReaddir
      .mockResolvedValueOnce([createDirent('src', true), createDirent('README.md', false)])
      .mockResolvedValueOnce([createDirent('App.jsx', false)]);

    const { GET } = await import('./route.js');
    const request = {
      url: 'https://devhub.test/api/fs/tree?base=%2Fworkspace%2Fdevhub&recursive=1',
    };

    await GET(request);

    const { NextResponse } = await import('next/server');
    const [[payload]] = NextResponse.json.mock.calls;

    expect(payload.mode).toBe('recursive');
    expect(payload.tree).toEqual([
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
    ]);
  });

  it('searches with a bounded walk and returns an ancestor tree', async () => {
    mockReaddir
      .mockResolvedValueOnce([createDirent('src', true), createDirent('README.md', false)])
      .mockResolvedValueOnce([createDirent('TerminalDock.jsx', false)]);

    const { GET } = await import('./route.js');
    const request = {
      url: 'https://devhub.test/api/fs/tree?base=%2Fworkspace%2Fdevhub&q=TerminalDock',
    };

    await GET(request);

    const { NextResponse } = await import('next/server');
    const [[payload]] = NextResponse.json.mock.calls;

    expect(payload.mode).toBe('search');
    expect(payload.tree).toEqual([
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [
          {
            name: 'TerminalDock.jsx',
            path: 'src/TerminalDock.jsx',
            type: 'file',
          },
        ],
      },
    ]);
  });

  it('refreshes the cached tree after the cache window expires', async () => {
    let currentTime = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

    mockReaddir
      .mockResolvedValueOnce([createDirent('src', true), createDirent('README.md', false)])
      .mockResolvedValueOnce([createDirent('lib', true), createDirent('README.md', false)]);

    const { GET } = await import('./route.js');
    const request = { url: 'https://devhub.test/api/fs/tree?base=%2Fworkspace%2Fdevhub' };

    await GET(request);

    currentTime += 100;
    await GET(request);

    currentTime += 120_000;
    await GET(request);

    const { NextResponse } = await import('next/server');
    const [[firstPayload], [secondPayload], [thirdPayload]] = NextResponse.json.mock.calls;

    expect(mockReaddir).toHaveBeenCalledTimes(2);
    expect(secondPayload.tree).toEqual(firstPayload.tree);
    expect(thirdPayload.tree).toEqual([
      {
        name: 'lib',
        path: 'lib',
        type: 'directory',
        children: null,
      },
      {
        name: 'README.md',
        path: 'README.md',
        type: 'file',
      },
    ]);
  });
});
