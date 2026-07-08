import { describe, expect, it } from 'vitest';
import { splitLocalFilePathSegments } from '../src/renderer/src/local-file-links';

describe('local file path links', () => {
  it('detects Windows file paths in assistant list output without swallowing metadata', () => {
    const text = '1. C:\\Users\\franc\\Downloads\\Baobab_THR-9B791B63.pdf — 19:21 — 422 KB';

    expect(splitLocalFilePathSegments(text)).toEqual([
      '1. ',
      { kind: 'local-file-path', path: 'C:\\Users\\franc\\Downloads\\Baobab_THR-9B791B63.pdf' },
      ' — 19:21 — 422 KB',
    ]);
  });

  it('leaves non-file text unchanged', () => {
    expect(splitLocalFilePathSegments('Nessun file trovato.')).toEqual(['Nessun file trovato.']);
  });
});
