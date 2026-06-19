import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAllowedPath, isPathInside } from '../src/shared/path-policy';

describe('path policy', () => {
  const root = path.resolve('C:/Users/example/OnarSuite Workspace');

  it('allows the root and descendants', () => {
    expect(isPathInside(root, root)).toBe(true);
    expect(isPathInside(path.join(root, 'clienti', 'rossi.pdf'), root)).toBe(true);
  });

  it('blocks sibling paths and traversal', () => {
    expect(isPathInside(path.resolve(root, '..', 'private.txt'), root)).toBe(false);
    expect(isPathInside(path.resolve('C:/Users/example/Other/file.txt'), root)).toBe(false);
  });

  it('accepts any explicitly authorized root', () => {
    const secondRoot = path.resolve('D:/Shared/Clienti');
    expect(isAllowedPath(path.join(secondRoot, 'cliente.csv'), [root, secondRoot])).toBe(true);
  });
});
