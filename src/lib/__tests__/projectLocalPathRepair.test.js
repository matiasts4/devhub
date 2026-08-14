import {
  isCrossPlatformPathMismatch,
  repairProjectLocalPath,
} from '../projectLocalPathRepair';

describe('isCrossPlatformPathMismatch', () => {
  test('flags a POSIX path while running on Windows', () => {
    expect(isCrossPlatformPathMismatch('/home/arxonlabs/devhub', true)).toBe(true);
  });

  test('accepts a drive-letter path on Windows', () => {
    expect(isCrossPlatformPathMismatch('D:\\devhub', true)).toBe(false);
    expect(isCrossPlatformPathMismatch('D:/devhub', true)).toBe(false);
  });

  test('flags a drive-letter path while running on a POSIX OS', () => {
    expect(isCrossPlatformPathMismatch('D:\\devhub', false)).toBe(true);
    expect(isCrossPlatformPathMismatch('C:/devhub', false)).toBe(true);
  });

  test('accepts a POSIX path on a POSIX OS', () => {
    expect(isCrossPlatformPathMismatch('/home/arxonlabs/devhub', false)).toBe(false);
  });

  test('ignores empty and non-string values', () => {
    expect(isCrossPlatformPathMismatch('', true)).toBe(false);
    expect(isCrossPlatformPathMismatch('   ', true)).toBe(false);
    expect(isCrossPlatformPathMismatch(null, true)).toBe(false);
    expect(isCrossPlatformPathMismatch(undefined, false)).toBe(false);
  });

  test('trims surrounding whitespace before checking', () => {
    expect(isCrossPlatformPathMismatch('  /home/arxonlabs/devhub  ', true)).toBe(true);
  });
});

describe('repairProjectLocalPath', () => {
  test('posts the projectId and returns the parsed payload on OK', async () => {
    const payload = { changed: true, exists: false, localPath: 'D:\\devhub' };
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => payload }));

    const result = await repairProjectLocalPath('project-1', { fetchImpl });

    expect(result).toEqual(payload);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/project/repair-local-path');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ projectId: 'project-1' });
  });

  test('returns null on a non-OK response', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 404 }));
    await expect(repairProjectLocalPath('missing', { fetchImpl })).resolves.toBeNull();
  });
});
