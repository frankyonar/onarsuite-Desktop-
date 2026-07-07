import type {
  ProviderCapability,
  ProviderDescriptor,
  ResourceSource,
  WorkspaceProviderStatus,
  WorkspaceResource,
  WorkspaceSearchOptions,
  WorkspaceSearchResult,
} from '../../../shared/workspace';

/**
 * A source of {@link WorkspaceResource}s. The Virtual Workspace only ever talks
 * to providers through this contract, so local files, cloud storage and remote
 * connectors are all interchangeable. Adding a new connector = adding a new
 * WorkspaceProvider; nothing else in the pipeline changes.
 */
export interface WorkspaceProvider {
  readonly key: string;
  readonly label: string;
  readonly source: ResourceSource;
  readonly capabilities: ProviderCapability[];

  status(): Promise<WorkspaceProviderStatus>;

  /** Search this provider. Providers with no data return []. */
  search(query: string, options?: WorkspaceSearchOptions): Promise<WorkspaceSearchResult[]>;

  /** Resolve a single resource by its workspace id. */
  get(id: string): Promise<WorkspaceResource | null>;

  /** Render the OSMEM memory card for a resource (throws if unsupported). */
  card(id: string): Promise<string>;
}

export async function describeProvider(provider: WorkspaceProvider): Promise<ProviderDescriptor> {
  let status: WorkspaceProviderStatus;
  try {
    status = await provider.status();
  } catch (error) {
    status = { state: 'error', message: error instanceof Error ? error.message : 'Errore provider.' };
  }
  return {
    key: provider.key,
    label: provider.label,
    source: provider.source,
    capabilities: provider.capabilities,
    status,
  };
}
