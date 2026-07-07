import { describe, expect, it } from 'vitest';
import { CloudBridgeProvider } from './cloud-bridge-provider';

const onlineRow = {
  resource: {
    id: 'contact:1', source: 'cloud', provider: 'onarsuite-cloud', path: 'contact:1',
    virtualPath: '/cloud/onarsuite/contact/1', name: 'Mario Rossi', type: 'contact',
    mime: 'application/x-onarsuite-contact', extension: '', size: 0, hash: '',
    createdAt: null, modifiedAt: '2026-07-01T00:00:00Z', indexedAt: null,
    privacy: { excludedFromAi: false, localOnly: false },
    metadata: { snippet: 'mario@rossi.it' },
  },
  scores: { semantic: 0, keyword: 1, recency: 0.9, permission: 1, final: 0.52 },
  matched_fields: ['name'],
  snippet: 'mario@rossi.it',
};

describe('CloudBridgeProvider', () => {
  it('returns nothing when the device is not paired', async () => {
    const p = new CloudBridgeProvider(async () => [onlineRow], () => false);
    expect(await p.search('rossi')).toEqual([]);
    expect((await p.status()).state).toBe('not_configured');
  });

  it('maps online rows into workspace results and renders a card', async () => {
    const p = new CloudBridgeProvider(async () => [onlineRow], () => true);
    const results = await p.search('rossi');
    expect(results).toHaveLength(1);
    expect(results[0].resource.name).toBe('Mario Rossi');
    expect(results[0].matchedFields).toEqual(['name']);
    expect(results[0].scores.final).toBe(0.52);
    const card = await p.card('contact:1');
    expect(card).toContain('OSMEM/1.0');
    expect(card).toContain('Mario Rossi');
  });

  it('never throws when the online call fails', async () => {
    const p = new CloudBridgeProvider(async () => { throw new Error('offline'); }, () => true);
    expect(await p.search('rossi')).toEqual([]);
  });
});
