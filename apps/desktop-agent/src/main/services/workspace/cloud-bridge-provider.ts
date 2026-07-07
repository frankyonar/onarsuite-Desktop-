import type {
  ProviderCapability,
  WorkspaceProviderStatus,
  WorkspaceResource,
  WorkspaceSearchOptions,
  WorkspaceSearchResult,
} from '../../../shared/workspace';
import type { WorkspaceProvider } from './provider';

/** Fetches scored rows from the online cloud Workspace (Agent Gateway). */
export type CloudSearchFn = (query: string, limit: number) => Promise<Array<Record<string, unknown>>>;

/**
 * Hybrid bridge: exposes the OnarSuite Cloud Virtual Workspace to the Desktop.
 * When the device is paired, `search` calls the online Agent Gateway and maps
 * the account's cloud resources (clienti, contratti, note, scadenze) into the
 * same {@link WorkspaceResource} shape as local memory — so Desktop Max sees
 * LOCAL + CLOUD as one workspace. Read-only; nothing local is sent to reach it.
 */
export class CloudBridgeProvider implements WorkspaceProvider {
  readonly key = 'onarsuite-cloud';
  readonly label = 'OnarSuite Cloud';
  readonly source = 'cloud' as const;
  readonly capabilities: ProviderCapability[] = ['search', 'read', 'card'];

  /** Resources seen in the latest searches, so card() can render without a refetch. */
  private readonly cache = new Map<string, WorkspaceResource>();

  constructor(
    private readonly cloudSearch: CloudSearchFn,
    private readonly isPaired: () => boolean,
  ) {}

  async status(): Promise<WorkspaceProviderStatus> {
    return this.isPaired()
      ? { state: 'ready', message: 'Collegato: ricerca su dati cloud (clienti, contratti, note, scadenze).' }
      : { state: 'not_configured', message: 'Collega OnarSuite Desktop a un account per la ricerca cloud.' };
  }

  async search(query: string, options: WorkspaceSearchOptions = {}): Promise<WorkspaceSearchResult[]> {
    if (!this.isPaired() || !query.trim()) return [];
    let rows: Array<Record<string, unknown>>;
    try {
      rows = await this.cloudSearch(query, options.limit ?? 8);
    } catch {
      return [];
    }
    return rows.map((row) => this.toResult(row)).filter((r): r is WorkspaceSearchResult => r !== null);
  }

  async get(id: string): Promise<WorkspaceResource | null> {
    return this.cache.get(id) ?? null;
  }

  async card(id: string): Promise<string> {
    const r = this.cache.get(id);
    if (!r) throw new Error('Risorsa cloud non in cache: esegui prima una ricerca.');
    const snippet = typeof r.metadata.snippet === 'string' ? r.metadata.snippet : '';
    return [
      'OSMEM/1.0',
      `@node ${r.id}`,
      `name: ${r.name}`,
      `kind: ${r.type}`,
      `source: cloud (${r.provider})`,
      `virtualPath: ${r.virtualPath}`,
      `modified: ${r.modifiedAt ?? 'n/d'}`,
      `summary.short: ${snippet}`,
      'permissions:',
      'send_to_cloud = allowed',
      'read_only = true',
    ].join('\n');
  }

  private toResult(row: Record<string, unknown>): WorkspaceSearchResult | null {
    const resource = row.resource as WorkspaceResource | undefined;
    const scores = row.scores as WorkspaceSearchResult['scores'] | undefined;
    if (!resource?.id || !scores) return null;
    this.cache.set(resource.id, resource);
    return {
      resource,
      scores,
      matchedFields: Array.isArray(row.matched_fields) ? (row.matched_fields as string[]) : [],
      snippet: typeof row.snippet === 'string' ? row.snippet : undefined,
    };
  }
}
