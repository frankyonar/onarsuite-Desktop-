import { describe, expect, it } from 'vitest';
import type {
  ProviderCapability,
  WorkspaceProviderStatus,
  WorkspaceResource,
  WorkspaceSearchResult,
} from '../../../shared/workspace';
import type { WorkspaceProvider } from './provider';
import { computeScores, permissionScore, recencyScore } from './retrieval';
import { VirtualWorkspace } from './virtual-workspace';

function resource(id: string, overrides: Partial<WorkspaceResource> = {}): WorkspaceResource {
  return {
    id,
    source: 'local',
    provider: 'fake',
    path: `C:/tmp/${id}.txt`,
    virtualPath: `/local/tmp/${id}.txt`,
    name: `${id}.txt`,
    type: 'text',
    mime: 'text/plain',
    extension: 'txt',
    size: 10,
    hash: 'h',
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: new Date().toISOString(),
    indexedAt: '2026-01-01T00:00:00.000Z',
    privacy: {
      localOnly: false,
      askBeforeCloud: true,
      sensitiveDetected: false,
      excludedFromAi: false,
      allowedScopes: ['local_retrieval'],
      readOnly: false,
      canSync: true,
      canEmbed: true,
      canSummarize: true,
    },
    metadata: {},
    ...overrides,
  };
}

class FakeProvider implements WorkspaceProvider {
  readonly label = 'Fake';
  readonly source = 'local' as const;
  readonly capabilities: ProviderCapability[] = ['search', 'read', 'card'];

  constructor(
    readonly key = 'fake',
    private readonly results: WorkspaceSearchResult[] = [],
  ) {}

  async status(): Promise<WorkspaceProviderStatus> {
    return { state: 'ready', resourceCount: this.results.length };
  }

  async search(): Promise<WorkspaceSearchResult[]> {
    return this.results;
  }

  async get(id: string): Promise<WorkspaceResource | null> {
    return this.results.find((r) => r.resource.id === id)?.resource ?? null;
  }

  async card(id: string): Promise<string> {
    return `CARD ${id}`;
  }
}

function scored(id: string, final: number, overrides: Partial<WorkspaceResource> = {}): WorkspaceSearchResult {
  return {
    resource: resource(id, overrides),
    scores: { semantic: 0, keyword: final, recency: 0.5, permission: 1, final },
    matchedFields: ['name'],
  };
}

describe('retrieval scoring', () => {
  it('normalizes keyword score against the set max', () => {
    const s = computeScores({ keywordRaw: 5, keywordMax: 10, resource: resource('a'), mode: 'desktop' });
    expect(s.keyword).toBeCloseTo(0.5);
    expect(s.final).toBeGreaterThan(0);
    expect(s.final).toBeLessThanOrEqual(1);
  });

  it('zeroes permission for excluded resources', () => {
    const r = resource('a', { privacy: { ...resource('a').privacy, excludedFromAi: true } });
    expect(permissionScore(r, 'hybrid')).toBe(0);
  });

  it('penalizes local-only resources in cloud mode', () => {
    const r = resource('a', { privacy: { ...resource('a').privacy, localOnly: true } });
    expect(permissionScore(r, 'cloud')).toBeLessThan(permissionScore(r, 'desktop'));
  });

  it('decays recency for old files', () => {
    expect(recencyScore('2000-01-01T00:00:00.000Z')).toBeLessThan(0.1);
    expect(recencyScore(new Date().toISOString())).toBeCloseTo(1, 1);
  });
});

describe('VirtualWorkspace', () => {
  it('merges and ranks results across providers by final score', async () => {
    const ws = new VirtualWorkspace()
      .register(new FakeProvider('fake1', [scored('low', 0.2)]))
      .register(new FakeProvider('fake2', [scored('high', 0.9)]));
    const results = await ws.search('x');
    expect(results.map((r) => r.resource.id)).toEqual(['high', 'low']);
  });

  it('builds an AI context within the token budget and reports exclusions', async () => {
    const ws = new VirtualWorkspace().register(
      new FakeProvider('fake', [
        scored('keep', 0.9),
        scored('drop', 0.1, { privacy: { ...resource('drop').privacy, excludedFromAi: true } }),
      ]),
    );
    const ctx = await ws.context({ query: 'x', level: 'simple', mode: 'hybrid' });
    expect(ctx.includedResources.map((r) => r.id)).toContain('keep');
    expect(ctx.excludedResources.map((r) => r.id)).toContain('drop');
    expect(ctx.usedTokens).toBeLessThanOrEqual(ctx.maxTokens);
    expect(ctx.context).toContain('CARD keep');
  });
});
