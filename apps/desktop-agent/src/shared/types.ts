export const APP_VERSION = '0.2.0';

export const MVP_SCOPES = [
  'files:read',
  'files:write_workspace',
  'files:upload',
  'crm:create_draft',
  'quotes:create_draft',
  'tasks:create',
] as const;

export const BLOCKED_SCOPES = [
  'email:send',
  'payments:create_link',
  'desktop:apps',
  'system:shell',
  'files:modify_existing',
] as const;

export type ConnectionState = 'connected' | 'offline' | 'not_paired' | 'revoked' | 'error';
export type LogLevel = 'info' | 'warning' | 'error' | 'security';
export type FileAction = 'upload' | 'create_task' | 'create_customer_draft' | 'create_quote_draft';

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
}

export interface AppSnapshot {
  appVersion: string;
  connection: ConnectionState;
  serverUrl: string;
  deviceId?: string;
  deviceName: string;
  accountLabel?: string;
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
  performFileAction(filePath: string, action: FileAction): Promise<ActionResult>;
  listAudit(): Promise<AuditEntry[]>;
  syncNow(): Promise<AppSnapshot>;
  clearLocalData(): Promise<AppSnapshot>;
  sendChat(input: ChatRequest): Promise<ChatResult>;
}
