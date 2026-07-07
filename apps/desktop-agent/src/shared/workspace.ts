/**
 * Shared Virtual Workspace contract.
 *
 * The Virtual Workspace is the single AI-readable layer over every data source
 * (local Memory Engine, OnarSuite Cloud, and connectors like Google Drive / Gmail
 * / GitHub). Max AI never talks to a provider directly — it talks to the
 * Workspace, which decides which provider to query.
 *
 * This file is the desktop-side mirror of the same contract implemented on
 * OnarSuite Online (app/Workspace/*). Keep the two in sync — see
 * docs/virtual-workspace.md.
 */

/** Where a resource physically lives. */
export type ResourceSource = 'local' | 'cloud' | 'connector';

/** How much a provider can currently do (used for the provider list UI). */
export type ProviderStatusState =
  | 'ready'
  | 'not_configured'
  | 'not_connected'
  | 'scanning'
  | 'error';

/** Retrieval + AI scope requested by the caller. */
export type WorkspaceMode = 'desktop' | 'cloud' | 'hybrid';

/**
 * Privacy + permission flags carried by every resource. Mirrors the online
 * MemoryPrivacy plus the extra capability gates required by the spec. Nothing
 * local is ever sent to the cloud automatically — `askBeforeCloud` stays true
 * until the user explicitly allows it.
 */
export interface ResourcePrivacyFlags {
  localOnly: boolean;
  askBeforeCloud: boolean;
  sensitiveDetected: boolean;
  excludedFromAi: boolean;
  allowedScopes: string[];
  readOnly: boolean;
  canSync: boolean;
  canEmbed: boolean;
  canSummarize: boolean;
}

/**
 * The unified resource. Everything the Workspace exposes — a local file, a Drive
 * document, a Gmail thread, a GitHub repo — is normalized into this shape,
 * independent of provenance.
 */
export interface WorkspaceResource {
  id: string;
  source: ResourceSource;
  /** Provider key, e.g. 'local-memory', 'onarsuite-cloud', 'github'. */
  provider: string;
  /** Native path/identifier inside the provider. */
  path: string;
  /** Stable virtual path inside /workspace (e.g. /local/documents/report.pdf). */
  virtualPath: string;
  name: string;
  /** documentKind: text | document | spreadsheet | image | source_code | … */
  type: string;
  mime: string;
  extension: string;
  size: number;
  hash: string;
  createdAt: string;
  modifiedAt: string;
  indexedAt: string;
  privacy: ResourcePrivacyFlags;
  metadata: Record<string, string | number | boolean | null>;
}

/**
 * Retrieval scores. `semantic` and `keyword` are the two recall signals;
 * `recency` and `permission` re-rank them; `final` is the blended score used
 * for ordering. Semantic stays 0 until embeddings land in Phase 2 — the field
 * is present now so the ranking pipeline never changes shape later.
 */
export interface RetrievalScores {
  semantic: number;
  keyword: number;
  recency: number;
  permission: number;
  final: number;
}

export interface WorkspaceSearchResult {
  resource: WorkspaceResource;
  scores: RetrievalScores;
  matchedFields: string[];
  /** Short highlight/snippet for the UI, when available. */
  snippet?: string;
}

export interface WorkspaceSearchOptions {
  limit?: number;
  mode?: WorkspaceMode;
  /** Restrict to a set of provider keys. */
  providers?: string[];
  extension?: string;
  folder?: string;
}

export interface WorkspaceProviderStatus {
  state: ProviderStatusState;
  resourceCount?: number;
  message?: string;
  lastActivityAt?: string;
}

/** One row in the provider list (elenco provider / stato provider). */
export interface ProviderDescriptor {
  key: string;
  label: string;
  source: ResourceSource;
  capabilities: ProviderCapability[];
  status: WorkspaceProviderStatus;
}

export type ProviderCapability =
  | 'search'
  | 'read'
  | 'card'
  | 'scan'
  | 'sync'
  | 'write';

/** Request for the AI Context Builder. */
export interface AiContextRequest {
  query: string;
  level?: WorkspaceBudgetLevel;
  mode?: WorkspaceMode;
  /** Optional provider allow-list (scope). */
  providers?: string[];
}

export type WorkspaceBudgetLevel = 'simple' | 'medium' | 'advanced';

/** A resource that was considered for the AI context, and the verdict. */
export interface ContextResourceRef {
  id: string;
  provider: string;
  name: string;
  virtualPath: string;
  finalScore: number;
  reason: string;
}

/** The final AI context payload handed to Max AI. */
export interface AiContextResult {
  query: string;
  mode: WorkspaceMode;
  context: string;
  usedTokens: number;
  maxTokens: number;
  includedResources: ContextResourceRef[];
  excludedResources: ContextResourceRef[];
  reason: string;
}

/** Aggregate workspace status (stato indicizzazione + providers). */
export interface WorkspaceStatus {
  providers: ProviderDescriptor[];
  totalResources: number;
}
