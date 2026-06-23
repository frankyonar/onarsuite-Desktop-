export const APP_VERSION = '0.9.18';

export type UpdateStatus = 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  percent?: number;
  transferredBytes?: number;
  totalBytes?: number;
  error?: string;
}

/** Capabilities Max can use autonomously inside authorized folders. */
export const MVP_SCOPES = [
  'files:read',
  'files:write',
  'files:edit_existing',
  'files:create',
  'files:delete',
  'files:upload',
  'system:shell',
  'crm:create_draft',
  'quotes:create_draft',
  'tasks:create',
] as const;

/** Hard limits that remain off even in autonomous mode. */
export const BLOCKED_SCOPES = [
  'email:send',
  'payments:create_link',
  'files:outside_allowlist',
] as const;

export type ConnectionState = 'connected' | 'offline' | 'not_paired' | 'revoked' | 'error';
export type LogLevel = 'info' | 'warning' | 'error' | 'security';
export type FileAction = 'upload' | 'create_task' | 'create_customer_draft' | 'create_quote_draft';

/** Local tools Max can call during an agent run. */
export type ToolName =
  | 'read_file'
  | 'list_dir'
  | 'search_files'
  | 'write_file'
  | 'edit_file'
  | 'create_file'
  | 'delete_file'
  | 'run_shell'
  | 'onar_action'
  | 'onar_upload';

/** OpenAI-style message used inside the agent loop. */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

/** Structured preview shown in the right-hand panel when Max produces an object. */
export interface PanelField { label: string; value: string; }
export interface PanelData {
  kind: 'customer' | 'contract' | 'file' | 'table' | 'result';
  title: string;
  subtitle?: string;
  ok?: boolean;
  fields?: PanelField[];
  columns?: string[];
  rows?: string[][];
  text?: string;
  /** For file panels: the absolute path (enables Open / Reveal) and a code language. */
  path?: string;
  lang?: string;
}

/** Events streamed from the agent loop (main) to the console (renderer). */
export type AgentStreamEvent =
  | { type: 'status'; runId: string; text: string }
  | { type: 'assistant'; runId: string; text: string }
  | { type: 'tool_start'; runId: string; id: string; tool: ToolName; title: string; command: string }
  | { type: 'tool_end'; runId: string; id: string; ok: boolean; preview: string; isDiff?: boolean }
  | { type: 'panel'; runId: string; panel: PanelData }
  | { type: 'done'; runId: string }
  | { type: 'error'; runId: string; message: string };

export interface AgentRunInput {
  message: string;
  /** Prior plain chat turns shown in the console, for continuity. */
  history: ChatMessage[];
  filePaths?: string[];
}

/** One rendered item in the chat transcript (UI). */
export type ConsoleItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; tool: ToolName; title: string; command: string; status: 'running' | 'done' | 'error'; preview?: string; isDiff?: boolean };

/** A saved conversation (history). */
export interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
}

export interface Conversation extends ConversationMeta {
  createdAt: string;
  items: ConsoleItem[];
}

export interface PairingInput {
  serverUrl: string;
  deviceName: string;
  pairingCode?: string;
}

export interface PairingResponse {
  device_id: string;
  device_uuid: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  account_label?: string;
  plan_name?: string;
}

export interface AppSnapshot {
  appVersion: string;
  connection: ConnectionState;
  serverUrl: string;
  deviceId?: string;
  deviceName: string;
  accountLabel?: string;
  planName?: string;
  workspacePath: string;
  authorizedFolders: string[];
  permissions: string[];
  lastSyncAt?: string;
  encryptionAvailable: boolean;
  pendingActions: number;
}

export interface LocalFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  size: number;
  modifiedAt: string;
  source: 'workspace' | 'authorized_folder';
}

export interface ParsedDocument {
  path: string;
  type: string;
  text: string;
  summary: string;
  metadata: Record<string, string | number>;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  eventType: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ActionResult {
  status: 'completed' | 'queued';
  message: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
  filePath?: string;
}

export interface ChatResult {
  message: ChatMessage;
}

/** A filesystem entry returned by the explorer (dir listing). */
export interface FsEntry {
  name: string;
  path: string;
  kind: 'dir' | 'file';
  size?: number;
  modifiedAt?: string;
  extension?: string;
}

export interface FileContent {
  path: string;
  text: string;
  truncated: boolean;
}

export interface MaxDesktopApi {
  getSnapshot(): Promise<AppSnapshot>;
  pair(input: PairingInput): Promise<AppSnapshot>;
  disconnect(): Promise<AppSnapshot>;
  addAuthorizedFolder(): Promise<AppSnapshot>;
  removeAuthorizedFolder(folderPath: string): Promise<AppSnapshot>;
  chooseFiles(): Promise<LocalFile[]>;
  importDroppedFiles(paths: string[]): Promise<LocalFile[]>;
  getPathForFile(file: File): string;
  listFiles(): Promise<LocalFile[]>;
  parseFile(filePath: string): Promise<ParsedDocument>;
  openFile(filePath: string): Promise<void>;
  revealFile(filePath: string): Promise<void>;
  performFileAction(filePath: string, action: FileAction): Promise<ActionResult>;
  listAudit(): Promise<AuditEntry[]>;
  syncNow(): Promise<AppSnapshot>;
  clearLocalData(): Promise<AppSnapshot>;
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<void>;
  onUpdateStateChanged(callback: (state: UpdateState) => void): () => void;
  sendChat(input: ChatRequest): Promise<ChatResult>;
  // --- Agent (Claude-Code-like autonomous loop) ---
  runAgent(input: AgentRunInput): Promise<void>;
  cancelAgent(): Promise<void>;
  resetAgent(): Promise<void>;
  // --- Conversation history ---
  listConversations(): Promise<ConversationMeta[]>;
  getConversation(id: string): Promise<Conversation | null>;
  saveConversation(input: { id: string; title?: string; items: ConsoleItem[] }): Promise<ConversationMeta[]>;
  newConversation(): Promise<Conversation>;
  selectConversation(id: string): Promise<void>;
  deleteConversation(id: string): Promise<ConversationMeta[]>;
  renameConversation(id: string, title: string): Promise<ConversationMeta[]>;
  titleConversation(id: string): Promise<ConversationMeta[]>;
  onAgentEvent(callback: (event: AgentStreamEvent) => void): () => void;
  // --- File explorer / editor ---
  explore(dirPath?: string): Promise<FsEntry[]>;
  readFileText(filePath: string): Promise<FileContent>;
  writeFileText(filePath: string, text: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  onar(actionType: string, data: Record<string, unknown>): Promise<OnarResult>;
  webLogin(serverUrl: string, appVersion: string): Promise<void>;
  webSessionUrl(): Promise<string>;
  onAuthChanged(callback: () => void): () => void;
}

export interface OnarResult {
  success: boolean;
  message: string;
  data?: unknown;
}
