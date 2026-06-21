import { dialog, safeStorage, shell } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, type ActionResult, type AgentRunInput, type AgentStreamEvent, type AppSnapshot, type ChatRequest, type ChatResult, type FileAction, type FileContent, type FsEntry, type LocalFile, type PairingInput } from '../shared/types';
import { isAllowedPath } from '../shared/path-policy';
import { AgentSdk, NetworkError, RevokedDeviceError } from './services/agent-sdk';
import { AgentEngine } from './services/agent-engine';
import { AgentTools } from './services/tools';
import { AuditLog } from './services/audit-log';
import { ConfigStore } from './services/config-store';
import { isSupportedFile, parseDocument } from './services/document-parser';

const MAX_READ_BYTES = 500 * 1024;

interface QueuedAction {
  id: string;
  idempotencyKey: string;
  action: FileAction;
  filePath: string;
  createdAt: string;
  attempts: number;
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export class DesktopRuntime {
  readonly config = new ConfigStore();
  readonly audit = new AuditLog(this.config.dataDirectory);
  readonly sdk = new AgentSdk(
    async () => (await this.config.read()).serverUrl,
    async () => this.config.getToken(),
  );
  readonly tools = new AgentTools(
    this.config,
    this.audit,
    (filePath) => this.performFileAction(filePath, 'upload'),
    (actionType, data) => this.sdk.onarExecute(actionType, data),
  );
  readonly engine = new AgentEngine(this.sdk, this.tools, this.audit);
  private connection: AppSnapshot['connection'] = 'not_paired';
  private readonly queuePath = path.join(this.config.dataDirectory, 'queue.json');
  private syncInProgress = false;

  async initialize(): Promise<void> {
    const config = await this.config.read();
    this.connection = config.deviceId ? 'offline' : 'not_paired';
    await this.audit.write('app_started', 'info', 'Max Desktop avviato', { appVersion: APP_VERSION });
    if (!safeStorage.isEncryptionAvailable()) {
      await this.audit.write('secure_storage_unavailable', 'warning', 'Archiviazione sicura non disponibile: il token non verra salvato.');
    }
  }

  async snapshot(): Promise<AppSnapshot> {
    const config = await this.config.read();
    return {
      appVersion: APP_VERSION,
      connection: config.deviceId ? this.connection : 'not_paired',
      serverUrl: config.serverUrl,
      deviceId: config.deviceId,
      deviceName: config.deviceName,
      accountLabel: config.accountLabel,
      workspacePath: config.workspacePath,
      authorizedFolders: config.authorizedFolders,
      permissions: config.permissions,
      lastSyncAt: config.lastSyncAt,
      encryptionAvailable: this.config.isEncryptionAvailable(),
      pendingActions: (await this.readQueue()).length,
    };
  }

  async pair(input: PairingInput): Promise<AppSnapshot> {
    validateHttpsUrl(input.serverUrl);
    const current = await this.config.update({ serverUrl: input.serverUrl.replace(/\/+$/, ''), deviceName: input.deviceName.trim() });
    const fingerprint = createHash('sha256').update(`${current.installationId}:${process.platform}:${process.arch}`).digest('hex');
    const paired = await this.sdk.pair(input, fingerprint);
    const tokenSaved = await this.config.saveToken(paired.access_token);
    await this.config.update({
      deviceId: paired.device_id,
      deviceUuid: paired.device_uuid,
      accountLabel: paired.account_label,
      tokenExpiresAt: paired.expires_at,
    });
    this.connection = 'connected';
    await this.audit.write('device_paired', 'info', 'Dispositivo collegato a OnarSuite', {
      deviceId: paired.device_id,
      serverUrl: input.serverUrl,
      tokenPersisted: tokenSaved,
    });
    await this.heartbeat();
    return this.snapshot();
  }

  /** Store the token/device received from the web deep-link login. */
  async applyDeepLinkAuth(params: { token: string; deviceId: string; deviceUuid?: string; account?: string; server?: string }): Promise<void> {
    if (params.server) {
      try { validateHttpsUrl(params.server); await this.config.update({ serverUrl: params.server.replace(/\/+$/, '') }); } catch { /* keep configured server */ }
    }
    const tokenSaved = await this.config.saveToken(params.token);
    await this.config.update({
      deviceId: params.deviceId,
      deviceUuid: params.deviceUuid,
      accountLabel: params.account,
    });
    this.connection = 'connected';
    await this.audit.write('device_paired', 'security', 'Collegato a OnarSuite via login web', { deviceId: params.deviceId, tokenPersisted: tokenSaved });
    await this.heartbeat();
  }

  async disconnect(): Promise<AppSnapshot> {
    const config = await this.config.read();
    await this.audit.write('device_disconnected', 'security', 'Pairing locale rimosso', { deviceId: config.deviceId ?? null });
    await this.config.clearPairing();
    this.connection = 'not_paired';
    return this.snapshot();
  }

  async heartbeat(): Promise<void> {
    const config = await this.config.read();
    if (!config.deviceId) return;
    try {
      await this.sdk.heartbeat(config.deviceId);
      this.connection = 'connected';
      await this.config.update({ lastSyncAt: new Date().toISOString() });
    } catch (error) {
      this.connection = error instanceof RevokedDeviceError ? 'revoked' : error instanceof NetworkError ? 'offline' : 'error';
      if (error instanceof RevokedDeviceError) {
        await this.audit.write('device_revoked', 'security', error.message, { deviceId: config.deviceId });
      }
    }
  }

  async addAuthorizedFolder(): Promise<AppSnapshot> {
    const result = await dialog.showOpenDialog({
      title: 'Autorizza una cartella per Max Desktop',
      properties: ['openDirectory'],
      buttonLabel: 'Autorizza cartella',
    });
    if (result.canceled || !result.filePaths[0]) return this.snapshot();
    const selected = await realpath(result.filePaths[0]);
    const config = await this.config.read();
    const folders = [...new Set([...config.authorizedFolders, selected])];
    await this.config.update({ authorizedFolders: folders });
    await this.audit.write('permission_updated', 'security', 'Cartella autorizzata', { folder: selected });
    return this.snapshot();
  }

  async removeAuthorizedFolder(folderPath: string): Promise<AppSnapshot> {
    const config = await this.config.read();
    await this.config.update({ authorizedFolders: config.authorizedFolders.filter((folder) => folder !== folderPath) });
    await this.audit.write('permission_updated', 'security', 'Autorizzazione cartella rimossa', { folder: folderPath });
    return this.snapshot();
  }

  async chooseFiles(): Promise<LocalFile[]> {
    const result = await dialog.showOpenDialog({
      title: 'Aggiungi file a OnarSuite Workspace',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Documenti supportati', extensions: ['pdf', 'docx', 'xlsx', 'csv', 'txt', 'md'] }],
    });
    if (result.canceled) return [];
    return this.importFiles(result.filePaths);
  }

  async importFiles(filePaths: string[]): Promise<LocalFile[]> {
    const config = await this.config.read();
    await mkdir(config.workspacePath, { recursive: true });
    const imported: LocalFile[] = [];
    for (const sourcePath of filePaths) {
      const canonical = await realpath(sourcePath);
      const details = await stat(canonical);
      if (!details.isFile() || !isSupportedFile(canonical)) continue;
      if (details.size > MAX_UPLOAD_BYTES) throw new Error(`Il file ${path.basename(canonical)} supera il limite di 50 MB.`);
      const destination = await uniqueDestination(config.workspacePath, path.basename(canonical));
      await copyFile(canonical, destination);
      imported.push(await toLocalFile(destination, 'workspace'));
      await this.audit.write('file_selected', 'info', 'File copiato nella workspace', {
        filename: path.basename(destination),
        size: details.size,
      });
    }
    return imported;
  }

  async listFiles(): Promise<LocalFile[]> {
    const config = await this.config.read();
    const sources: Array<{ root: string; source: LocalFile['source'] }> = [
      { root: config.workspacePath, source: 'workspace' },
      ...config.authorizedFolders.map((root) => ({ root, source: 'authorized_folder' as const })),
    ];
    const files: LocalFile[] = [];
    for (const { root, source } of sources) {
      try {
        for (const entry of await readdir(root, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          const filePath = path.join(root, entry.name);
          if (isSupportedFile(filePath)) files.push(await toLocalFile(filePath, source));
        }
      } catch {
        // A folder can be temporarily unavailable; the rest of the app remains usable.
      }
    }
    return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  async parseFile(filePath: string) {
    await this.assertAuthorized(filePath);
    const parsed = await parseDocument(filePath);
    await this.audit.write('file_parsed', 'info', 'Testo estratto localmente', {
      filename: path.basename(filePath),
      size: parsed.metadata.size,
    });
    return parsed;
  }

  async openFile(filePath: string): Promise<void> {
    await this.assertAuthorized(filePath);
    const result = await shell.openPath(filePath);
    if (result) throw new Error(result);
  }

  async performFileAction(filePath: string, action: FileAction, queueOnNetworkError = true, idempotencyKey: string = randomUUID()): Promise<ActionResult> {
    await this.assertAuthorized(filePath);
    const details = await stat(filePath);
    if (details.size > MAX_UPLOAD_BYTES) throw new Error('Il file supera il limite configurato di 50 MB.');
    const config = await this.config.read();
    if (!config.deviceId) throw new Error('Collega prima Max Desktop a OnarSuite.');

    try {
      if (action === 'upload') {
        await this.sdk.uploadArtifact(filePath, config.deviceId, idempotencyKey);
      } else {
        const parsed = await parseDocument(filePath);
        const kind = action === 'create_task' ? 'task' : action === 'create_customer_draft' ? 'customer-draft' : 'quote-draft';
        await this.sdk.createFromFile(kind, filePath, config.deviceId, parsed.text, idempotencyKey);
      }
      this.connection = 'connected';
      await this.config.update({ lastSyncAt: new Date().toISOString() });
      await this.audit.write(actionEvent(action), 'info', 'Azione completata su OnarSuite', { filename: path.basename(filePath) });
      return { status: 'completed', message: 'Operazione completata su OnarSuite.' };
    } catch (error) {
      if (queueOnNetworkError && error instanceof NetworkError) {
        await this.enqueue({
          id: randomUUID(),
          idempotencyKey,
          action,
          filePath,
          createdAt: new Date().toISOString(),
          attempts: 0,
        });
        this.connection = 'offline';
        await this.audit.write('action_queued', 'warning', 'OnarSuite offline: azione salvata nella coda locale', {
          action,
          filename: path.basename(filePath),
        });
        return { status: 'queued', message: 'OnarSuite non raggiungibile. Operazione salvata nella coda locale.' };
      }
      if (error instanceof RevokedDeviceError) this.connection = 'revoked';
      await this.audit.write('action_failed', error instanceof RevokedDeviceError ? 'security' : 'error', errorMessage(error), {
        action,
        filename: path.basename(filePath),
      });
      throw error;
    }
  }

  async syncNow(): Promise<AppSnapshot> {
    if (this.syncInProgress) return this.snapshot();
    this.syncInProgress = true;
    try {
      await this.heartbeat();
      if (this.connection !== 'connected') return this.snapshot();
      const queue = await this.readQueue();
      const remaining: QueuedAction[] = [];
      for (const item of queue) {
        try {
          await this.performFileAction(item.filePath, item.action, false, item.idempotencyKey);
        } catch {
          remaining.push({ ...item, attempts: item.attempts + 1 });
        }
      }
      await this.writeQueue(remaining);
      await this.audit.write('sync_completed', 'info', 'Sincronizzazione completata', { processed: queue.length - remaining.length, pending: remaining.length });
      return this.snapshot();
    } finally {
      this.syncInProgress = false;
    }
  }

  async clearLocalData(): Promise<AppSnapshot> {
    await this.audit.clear();
    await rm(this.queuePath, { force: true });
    await this.config.clearAll();
    this.connection = 'not_paired';
    await this.config.read();
    return this.snapshot();
  }

  async sendChat(input: ChatRequest): Promise<ChatResult> {
    const message = input.message.trim();
    if (!message) throw new Error('Scrivi un messaggio per Max.');
    const config = await this.config.read();
    if (!config.deviceId) throw new Error('Collega prima Max Desktop a OnarSuite.');

    let fileContext: { filename: string; text: string } | undefined;
    if (input.filePath) {
      await this.assertAuthorized(input.filePath);
      const parsed = await parseDocument(input.filePath);
      fileContext = { filename: path.basename(input.filePath), text: parsed.text.slice(0, 50_000) };
    }

    try {
      const content = await this.sdk.chat(config.deviceId, message, input.history, fileContext);
      this.connection = 'connected';
      await this.audit.write('max_chat_completed', 'info', 'Richiesta elaborata da Max', {
        hasFileContext: Boolean(fileContext),
      });
      return { message: { id: randomUUID(), role: 'assistant', content, createdAt: new Date().toISOString() } };
    } catch (error) {
      if (error instanceof NetworkError) this.connection = 'offline';
      if (error instanceof RevokedDeviceError) this.connection = 'revoked';
      await this.audit.write('max_chat_failed', error instanceof RevokedDeviceError ? 'security' : 'error', errorMessage(error));
      throw error;
    }
  }

  /** Run the autonomous agent loop, streaming tool/assistant events to the UI. */
  async runAgent(input: AgentRunInput, emit: (event: AgentStreamEvent) => void): Promise<void> {
    const message = input.message.trim();
    if (!message) throw new Error('Scrivi un messaggio per Max.');
    const config = await this.config.read();
    if (!config.deviceId) {
      emit({ type: 'error', runId: 'pre', message: 'Collega prima Max Desktop a OnarSuite.' });
      return;
    }

    let fileContext: string | undefined;
    if (input.filePath) {
      await this.assertAuthorized(input.filePath);
      const parsed = await parseDocument(input.filePath);
      fileContext = `${path.basename(input.filePath)}:\n${parsed.text.slice(0, 50_000)}`;
    }

    await this.audit.write('agent_run_started', 'info', 'Avvio run agente Max', { hasFileContext: Boolean(fileContext) });
    await this.engine.run(message, fileContext, emit);
    this.connection = 'connected';
    await this.config.update({ lastSyncAt: new Date().toISOString() });
  }

  cancelAgent(): void {
    this.engine.cancel();
  }

  resetAgent(): void {
    this.engine.reset();
  }

  /** Explorer: list a directory, or the authorized roots when no path is given. */
  async explore(dirPath?: string): Promise<FsEntry[]> {
    const config = await this.config.read();
    if (!dirPath) {
      const roots = [config.workspacePath, ...config.authorizedFolders];
      return Promise.all(roots.map(async (root) => toFsEntry(root, 'dir')));
    }
    await this.assertAuthorized(dirPath);
    const entries: FsEntry[] = [];
    for (const entry of await readdir(dirPath, { withFileTypes: true })) {
      entries.push(await toFsEntry(path.join(dirPath, entry.name), entry.isDirectory() ? 'dir' : 'file'));
    }
    return entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
  }

  async readFileText(filePath: string): Promise<FileContent> {
    await this.assertAuthorized(filePath);
    const details = await stat(filePath);
    const handle = await readFile(filePath);
    const truncated = handle.length > MAX_READ_BYTES;
    return { path: filePath, text: handle.subarray(0, MAX_READ_BYTES).toString('utf8'), truncated: truncated || details.size > MAX_READ_BYTES };
  }

  async writeFileText(filePath: string, text: string): Promise<void> {
    await this.assertAuthorized(filePath);
    await writeFile(filePath, text, 'utf8');
    await this.audit.write('file_edited', 'security', 'File modificato dall\'editor', { filename: path.basename(filePath) });
  }

  /** Native OnarSuite call (list/create/…) used by the native module screens. */
  async onarCall(actionType: string, data: Record<string, unknown>): Promise<{ success: boolean; message: string; data?: unknown }> {
    const config = await this.config.read();
    if (!config.deviceId) return { success: false, message: 'Collega prima OnarSuite Desktop a OnarSuite.' };
    try {
      const result = await this.sdk.onarExecute(actionType, data);
      this.connection = 'connected';
      return result;
    } catch (error) {
      if (error instanceof NetworkError) this.connection = 'offline';
      if (error instanceof RevokedDeviceError) this.connection = 'revoked';
      return { success: false, message: errorMessage(error) };
    }
  }

  private async assertAuthorized(filePath: string): Promise<void> {
    const canonical = await realpath(filePath);
    const config = await this.config.read();
    const roots = await Promise.all([config.workspacePath, ...config.authorizedFolders].map(async (root) => {
      try { return await realpath(root); } catch { return root; }
    }));
    if (!isAllowedPath(canonical, roots)) {
      await this.audit.write('security_warning', 'security', 'Tentativo di accesso a file non autorizzato', { filename: path.basename(filePath) });
      throw new Error('Il file non appartiene alla workspace o a una cartella autorizzata.');
    }
  }

  private async enqueue(item: QueuedAction): Promise<void> {
    const queue = await this.readQueue();
    queue.push(item);
    await this.writeQueue(queue);
  }

  private async readQueue(): Promise<QueuedAction[]> {
    try { return JSON.parse(await readFile(this.queuePath, 'utf8')) as QueuedAction[]; } catch { return []; }
  }

  private async writeQueue(queue: QueuedAction[]): Promise<void> {
    await mkdir(path.dirname(this.queuePath), { recursive: true });
    await writeFile(this.queuePath, JSON.stringify(queue, null, 2), { encoding: 'utf8', mode: 0o600 });
  }
}

async function toLocalFile(filePath: string, source: LocalFile['source']): Promise<LocalFile> {
  const details = await stat(filePath);
  return {
    id: createHash('sha256').update(filePath).digest('hex').slice(0, 16),
    name: path.basename(filePath),
    path: filePath,
    extension: path.extname(filePath).slice(1).toLowerCase(),
    size: details.size,
    modifiedAt: details.mtime.toISOString(),
    source,
  };
}

async function toFsEntry(fullPath: string, kind: FsEntry['kind']): Promise<FsEntry> {
  let size: number | undefined;
  let modifiedAt: string | undefined;
  try {
    const details = await stat(fullPath);
    size = kind === 'file' ? details.size : undefined;
    modifiedAt = details.mtime.toISOString();
  } catch { /* path may be unavailable */ }
  return {
    name: path.basename(fullPath),
    path: fullPath,
    kind,
    size,
    modifiedAt,
    extension: kind === 'file' ? path.extname(fullPath).slice(1).toLowerCase() : undefined,
  };
}

async function uniqueDestination(root: string, filename: string): Promise<string> {
  const parsed = path.parse(filename);
  let candidate = path.join(root, filename);
  let counter = 1;
  while (true) {
    try { await stat(candidate); candidate = path.join(root, `${parsed.name}-${counter++}${parsed.ext}`); } catch { return candidate; }
  }
}

function validateHttpsUrl(value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Inserisci un URL OnarSuite valido.'); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('OnarSuite deve usare HTTPS. HTTP e consentito solo per localhost.');
  }
}

function actionEvent(action: FileAction): string {
  return ({ upload: 'file_uploaded', create_task: 'task_created', create_customer_draft: 'customer_draft_created', create_quote_draft: 'quote_draft_created' } as const)[action];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Errore imprevisto.';
}
