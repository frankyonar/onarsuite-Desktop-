import path from 'node:path';
import type { MemoryFileRecord, MemorySearchResult } from '../../../shared/types';
import type {
  ProviderCapability,
  ResourcePrivacyFlags,
  WorkspaceProviderStatus,
  WorkspaceResource,
  WorkspaceSearchOptions,
  WorkspaceSearchResult,
} from '../../../shared/workspace';
import type { OwnerMemoryEngine } from '../owner-memory/owner-memory-engine';
import type { WorkspaceProvider } from './provider';
import { computeScores } from './retrieval';
import { cosine, HashingEmbedder } from './embeddings';

/**
 * Adapts the local {@link OwnerMemoryEngine} to a {@link WorkspaceProvider}.
 * This is the `/local` branch of the Virtual Workspace: it reuses the existing
 * scan/index/osmem machinery instead of duplicating it. The Memory Engine stays
 * the source of truth; this layer only normalizes records into resources and
 * folds keyword scores into the shared retrieval scale.
 */
export class LocalMemoryProvider implements WorkspaceProvider {
  readonly key = 'local-memory';
  readonly label = 'Memoria locale (Desktop)';
  readonly source = 'local' as const;
  readonly capabilities: ProviderCapability[] = ['search', 'read', 'card', 'scan'];

  private readonly embedder = new HashingEmbedder();

  constructor(private readonly engine: OwnerMemoryEngine) {}

  async status(): Promise<WorkspaceProviderStatus> {
    const status = await this.engine.getStatus();
    return {
      state: status.state === 'scanning' ? 'scanning' : 'ready',
      resourceCount: status.totalFiles,
      lastActivityAt: status.lastScan?.completedAt,
      message: status.state === 'scanning' ? `Scansione: ${status.processedFiles}/${status.totalFiles}` : undefined,
    };
  }

  async search(query: string, options: WorkspaceSearchOptions = {}): Promise<WorkspaceSearchResult[]> {
    const mode = options.mode ?? 'desktop';
    const results = await this.engine.search(query, {
      limit: options.limit ?? 20,
      extension: options.extension,
      folder: options.folder,
    });
    const keywordMax = results.reduce((max, item) => Math.max(max, item.score), 0);
    const queryVector = this.embedder.embed(query);
    return results.map((item) => this.toSearchResult(item, keywordMax, mode, queryVector));
  }

  async get(id: string): Promise<WorkspaceResource | null> {
    const record = await this.engine.record(id);
    return record ? toResource(record) : null;
  }

  card(id: string): Promise<string> {
    return this.engine.card(id);
  }

  private toSearchResult(item: MemorySearchResult, keywordMax: number, mode: WorkspaceSearchOptions['mode'], queryVector: Float32Array): WorkspaceSearchResult {
    const resource = toResource(item.record);
    const semantic = cosine(queryVector, this.embedder.embed(recordText(item.record)));
    return {
      resource,
      scores: computeScores({ keywordRaw: item.score, keywordMax, semantic, resource, mode: mode ?? 'desktop' }),
      matchedFields: item.matchedFields,
      snippet: item.record.summaryShort || undefined,
    };
  }
}

/** Text surface used for semantic embedding: the descriptive fields, not raw body. */
function recordText(record: MemoryFileRecord): string {
  return [
    record.name,
    record.summaryShort,
    record.summaryLong,
    record.topics.join(' '),
    record.entities.map((entity) => entity.value).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
}

export function toResource(record: MemoryFileRecord): WorkspaceResource {
  return {
    id: record.id,
    source: 'local',
    provider: 'local-memory',
    path: record.path,
    virtualPath: toVirtualPath(record.path),
    name: record.name,
    type: record.documentKind,
    mime: record.mimeType,
    extension: record.extension,
    size: record.size,
    hash: record.hash,
    createdAt: record.createdAt,
    modifiedAt: record.modifiedAt,
    indexedAt: record.indexedAt,
    privacy: toPrivacy(record),
    metadata: {
      indexStatus: record.indexStatus,
      indexError: record.indexError ?? null,
      topics: record.topics.join(', '),
      chunkCount: record.chunks.length,
      entityCount: record.entities.length,
    },
  };
}

function toPrivacy(record: MemoryFileRecord): ResourcePrivacyFlags {
  const p = record.privacy;
  const indexed = record.indexStatus === 'indexed';
  return {
    localOnly: p.localOnly,
    askBeforeCloud: p.askBeforeCloud,
    sensitiveDetected: p.sensitiveDetected,
    excludedFromAi: p.excludedFromAi,
    allowedScopes: p.allowedScopes,
    readOnly: false,
    canSync: !p.localOnly && !p.excludedFromAi,
    canEmbed: indexed && !p.excludedFromAi,
    canSummarize: indexed && !p.excludedFromAi,
  };
}

/** Map an absolute local path to a stable /local/... virtual path. */
function toVirtualPath(absolute: string): string {
  const withoutDrive = absolute.replace(/^[a-zA-Z]:[\\/]+/, '');
  const normalized = withoutDrive.split(path.sep).join('/').replace(/^\/+/, '');
  return `/local/${normalized}`;
}
