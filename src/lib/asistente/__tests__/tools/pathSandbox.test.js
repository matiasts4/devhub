/**
 * @jest-environment node
 */

import path from 'node:path';
import { assertWithinRoot, resolveProjectRoot } from '../../tools/pathSandbox';

describe('pathSandbox', () => {
  const root = resolveProjectRoot();

  test('allows root itself', () => {
    expect(assertWithinRoot(root)).toBe(true);
  });

  test('allows subpath of root', () => {
    expect(assertWithinRoot(path.join(root, 'src', 'lib', 'foo.js'))).toBe(true);
  });

  test('allows .devhub subpath', () => {
    expect(assertWithinRoot(path.join(root, '.devhub', 'config.json'))).toBe(true);
  });

  test('rejects parent directory traversal', () => {
    expect(assertWithinRoot(path.join(root, '..', 'etc', 'passwd'))).toBe(false);
  });

  test('rejects absolute path outside root', () => {
    expect(assertWithinRoot('/etc/passwd')).toBe(false);
  });

  test('rejects symlink-like escape', () => {
    expect(assertWithinRoot(path.join(root, 'src', '..', '..', 'etc'))).toBe(false);
  });

  test('allows devhub tmp prefix', () => {
    expect(assertWithinRoot(path.join(require('os').tmpdir(), 'devhub-test', 'x'))).toBe(true);
  });
});
