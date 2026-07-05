import { describe, expect, it } from 'vitest';
import { formatUpdateBytes, getUpdatePresentation } from '../src/renderer/src/update-ui';

describe('update presentation', () => {
  it('explains that a discovered update downloads automatically', () => {
    const result = getUpdatePresentation({ status: 'available', currentVersion: '0.9.30', availableVersion: '0.9.31' });
    expect(result.title).toContain('0.9.31');
    expect(result.message).toContain('automaticamente');
    expect(result.buttonLabel).toBeUndefined();
  });

  it('shows bounded progress and human-readable transfer size', () => {
    const result = getUpdatePresentation({
      status: 'downloading', currentVersion: '0.9.30', availableVersion: '0.9.31',
      percent: 142, transferredBytes: 10 * 1_024 * 1_024, totalBytes: 20 * 1_024 * 1_024,
    });
    expect(result.message).toContain('100%');
    expect(result.message).toContain('10 MB di 20 MB');
    expect(formatUpdateBytes(1_536)).toBe('1.5 KB');
  });

  it('keeps installation explicit once the download is ready', () => {
    const result = getUpdatePresentation({ status: 'downloaded', currentVersion: '0.9.30', availableVersion: '0.9.31' });
    expect(result.buttonLabel).toBe('Riavvia e aggiorna');
  });
});
