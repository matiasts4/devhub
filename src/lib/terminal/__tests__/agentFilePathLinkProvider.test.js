const {
  createAgentFilePathLinkProvider,
  isAgentFileLinkSession,
} = require('../agentFilePathLinkProvider');

describe('isAgentFileLinkSession', () => {
  test('uses detectors', () => {
    expect(
      isAgentFileLinkSession('grok', {
        isGrok: (c) => c.includes('grok'),
        isOpenCode: () => false,
      })
    ).toBe(true);
    expect(
      isAgentFileLinkSession('opencode', {
        isGrok: () => false,
        isOpenCode: (c) => c.includes('opencode'),
      })
    ).toBe(true);
    expect(
      isAgentFileLinkSession('bash', {
        isGrok: () => false,
        isOpenCode: () => false,
      })
    ).toBe(false);
  });
});

describe('createAgentFilePathLinkProvider', () => {
  test('disabled yields no links', () => {
    const provider = createAgentFilePathLinkProvider({
      isEnabled: () => false,
      getLineText: () => 'src/a.js',
    });
    let result = 'unset';
    provider.provideLinks(1, (links) => {
      result = links;
    });
    expect(result).toBeUndefined();
  });

  test('enabled returns link ranges', () => {
    const provider = createAgentFilePathLinkProvider({
      isEnabled: () => true,
      getLineText: () => 'see src/lib/foo.ts:10',
    });
    let links;
    provider.provideLinks(2, (l) => {
      links = l;
    });
    expect(links).toHaveLength(1);
    expect(links[0].range.start.y).toBe(2);
    expect(links[0].range.start.x).toBeGreaterThan(0);
  });

  test('activate without modifier does not open', () => {
    const onOpen = jest.fn();
    const provider = createAgentFilePathLinkProvider({
      isEnabled: () => true,
      getLineText: () => 'src/a.js',
      getResolveContext: () => ({ projectRoot: 'D:/devhub', cwd: 'D:/devhub' }),
      onOpen,
    });
    let links;
    provider.provideLinks(1, (l) => {
      links = l;
    });
    links[0].activate({ ctrlKey: false, metaKey: false }, 'src/a.js');
    expect(onOpen).not.toHaveBeenCalled();
  });

  test('activate with ctrl opens resolved path', () => {
    const onOpen = jest.fn();
    const provider = createAgentFilePathLinkProvider({
      isEnabled: () => true,
      getLineText: () => 'D:\\devhub\\src\\a.js',
      getResolveContext: () => ({ projectRoot: 'D:/devhub', cwd: 'D:/devhub', source: 'test' }),
      onOpen,
    });
    let links;
    provider.provideLinks(1, (l) => {
      links = l;
    });
    expect(links?.length).toBeGreaterThanOrEqual(1);
    links[0].activate({ ctrlKey: true }, links[0].text);
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'src/a.js',
        source: 'test',
      })
    );
  });
});
