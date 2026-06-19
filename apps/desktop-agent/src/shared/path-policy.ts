import path from 'node:path';

export function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function isAllowedPath(candidate: string, roots: string[]): boolean {
  return roots.some((root) => isPathInside(candidate, root));
}
