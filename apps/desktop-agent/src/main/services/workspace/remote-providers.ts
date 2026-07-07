import type {
  ProviderCapability,
  ResourceSource,
  WorkspaceProviderStatus,
  WorkspaceResource,
  WorkspaceSearchResult,
} from '../../../shared/workspace';
import type { WorkspaceProvider } from './provider';

/**
 * Structure-only remote provider. Phase 1 registers these so the Virtual
 * Workspace already exposes the full provider list (elenco/stato provider) and
 * a stable contract; retrieval against them is wired in Phase 2 (cloud sync +
 * connector OAuth). They never surface local data and never throw.
 */
export class RemoteStubProvider implements WorkspaceProvider {
  readonly capabilities: ProviderCapability[];

  constructor(
    readonly key: string,
    readonly label: string,
    readonly source: ResourceSource,
    private readonly resolveStatus: () => Promise<WorkspaceProviderStatus> | WorkspaceProviderStatus,
    capabilities: ProviderCapability[] = ['search', 'read'],
  ) {
    this.capabilities = capabilities;
  }

  async status(): Promise<WorkspaceProviderStatus> {
    return this.resolveStatus();
  }

  async search(): Promise<WorkspaceSearchResult[]> {
    return [];
  }

  async get(): Promise<WorkspaceResource | null> {
    return null;
  }

  async card(): Promise<string> {
    throw new Error('Provider remoto non ancora attivo (Fase 2).');
  }
}

/** Connector providers (Google Drive, Gmail, GitHub, …). Gestiti online via OAuth. */
export function createConnectorProviders(): RemoteStubProvider[] {
  const connectors: Array<{ key: string; label: string }> = [
    { key: 'google-drive', label: 'Google Drive' },
    { key: 'gmail', label: 'Gmail' },
    { key: 'github', label: 'GitHub' },
    { key: 'notion', label: 'Notion' },
    { key: 'onedrive', label: 'OneDrive' },
    { key: 'dropbox', label: 'Dropbox' },
  ];
  return connectors.map(
    ({ key, label }) =>
      new RemoteStubProvider(key, label, 'connector', () => ({
        state: 'not_connected',
        message: 'Connettore gestito da OnarSuite Online (OAuth). Retrieval in Fase 2.',
      })),
  );
}
