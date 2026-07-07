import type {
  AiContextRequest,
  AiContextResult,
  ProviderDescriptor,
  WorkspaceResource,
  WorkspaceSearchOptions,
  WorkspaceSearchResult,
  WorkspaceStatus,
} from '../../../shared/workspace';
import { AiContextBuilder } from './ai-context-builder';
import { describeProvider, type WorkspaceProvider } from './provider';

/**
 * The single AI-readable layer over every source. Max AI never queries Google
 * Drive, Gmail or the file system directly — it asks the Workspace, and the
 * Workspace decides which provider(s) to hit. Providers are interchangeable
 * (see {@link WorkspaceProvider}); the local Memory Engine is just the first one.
 */
export class VirtualWorkspace {
  private readonly providers = new Map<string, WorkspaceProvider>();
  private readonly contextBuilder = new AiContextBuilder();

  register(provider: WorkspaceProvider): this {
    this.providers.set(provider.key, provider);
    return this;
  }

  list(): WorkspaceProvider[] {
    return [...this.providers.values()];
  }

  private selected(keys?: string[]): WorkspaceProvider[] {
    if (!keys?.length) return this.list();
    return keys.map((key) => this.providers.get(key)).filter((p): p is WorkspaceProvider => Boolean(p));
  }

  async describeProviders(): Promise<ProviderDescriptor[]> {
    return Promise.all(this.list().map(describeProvider));
  }

  async status(): Promise<WorkspaceStatus> {
    const providers = await this.describeProviders();
    const totalResources = providers.reduce((sum, p) => sum + (p.status.resourceCount ?? 0), 0);
    return { providers, totalResources };
  }

  async search(query: string, options: WorkspaceSearchOptions = {}): Promise<WorkspaceSearchResult[]> {
    const providers = this.selected(options.providers);
    const perProvider = await Promise.all(
      providers.map(async (provider) => {
        try {
          return await provider.search(query, options);
        } catch {
          return [] as WorkspaceSearchResult[];
        }
      }),
    );
    const merged = perProvider.flat().sort((a, b) => b.scores.final - a.scores.final);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    return merged.slice(0, limit);
  }

  async get(id: string, providerKey?: string): Promise<WorkspaceResource | null> {
    for (const provider of this.selected(providerKey ? [providerKey] : undefined)) {
      const resource = await provider.get(id).catch(() => null);
      if (resource) return resource;
    }
    return null;
  }

  async card(id: string, providerKey?: string): Promise<string> {
    const provider = providerKey ? this.providers.get(providerKey) : await this.ownerOf(id);
    if (!provider) throw new Error('Risorsa non trovata nel Workspace.');
    return provider.card(id);
  }

  async context(request: AiContextRequest): Promise<AiContextResult> {
    const results = await this.search(request.query, {
      limit: 30,
      mode: request.mode,
      providers: request.providers,
    });
    return this.contextBuilder.build(request, results, (result) =>
      this.card(result.resource.id, result.resource.provider),
    );
  }

  private async ownerOf(id: string): Promise<WorkspaceProvider | undefined> {
    for (const provider of this.list()) {
      const resource = await provider.get(id).catch(() => null);
      if (resource) return provider;
    }
    return undefined;
  }
}
