import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AgentRunInput, AgentStreamEvent, ChatRequest, FileAction, MaxDesktopApi, PairingInput, UpdateState } from '../shared/types';

const api: MaxDesktopApi = {
  getSnapshot: () => ipcRenderer.invoke('app:snapshot'),
  pair: (input: PairingInput) => ipcRenderer.invoke('agent:pair', input),
  disconnect: () => ipcRenderer.invoke('agent:disconnect'),
  addAuthorizedFolder: () => ipcRenderer.invoke('folders:add'),
  removeAuthorizedFolder: (folderPath: string) => ipcRenderer.invoke('folders:remove', folderPath),
  chooseFiles: () => ipcRenderer.invoke('files:choose'),
  importDroppedFiles: (paths: string[]) => ipcRenderer.invoke('files:import', paths),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  listFiles: () => ipcRenderer.invoke('files:list'),
  parseFile: (filePath: string) => ipcRenderer.invoke('files:parse', filePath),
  openFile: (filePath: string) => ipcRenderer.invoke('files:open', filePath),
  revealFile: (filePath: string) => ipcRenderer.invoke('files:reveal', filePath),
  performFileAction: (filePath: string, action: FileAction) =>
    ipcRenderer.invoke('files:action', filePath, action),
  listAudit: () => ipcRenderer.invoke('audit:list'),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  clearLocalData: () => ipcRenderer.invoke('app:clear-local-data'),
  getUpdateState: () => ipcRenderer.invoke('update:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStateChanged: (callback: (state: UpdateState) => void) => {
    const listener = (_event: unknown, payload: UpdateState): void => callback(payload);
    ipcRenderer.on('update:state-changed', listener);
    return () => ipcRenderer.removeListener('update:state-changed', listener);
  },
  sendChat: (input: ChatRequest) => ipcRenderer.invoke('chat:send', input),
  runAgent: (input: AgentRunInput) => ipcRenderer.invoke('agent:run', input),
  cancelAgent: () => ipcRenderer.invoke('agent:cancel'),
  resetAgent: () => ipcRenderer.invoke('agent:reset'),
  listConversations: () => ipcRenderer.invoke('conv:list'),
  getConversation: (id: string) => ipcRenderer.invoke('conv:get', id),
  saveConversation: (input: { id: string; title?: string; items: unknown[] }) => ipcRenderer.invoke('conv:save', input),
  newConversation: () => ipcRenderer.invoke('conv:new'),
  selectConversation: (id: string) => ipcRenderer.invoke('conv:select', id),
  deleteConversation: (id: string) => ipcRenderer.invoke('conv:delete', id),
  renameConversation: (id: string, title: string) => ipcRenderer.invoke('conv:rename', id, title),
  titleConversation: (id: string) => ipcRenderer.invoke('conv:title', id),
  onAgentEvent: (callback: (event: AgentStreamEvent) => void) => {
    const listener = (_event: unknown, payload: AgentStreamEvent): void => callback(payload);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
  explore: (dirPath?: string) => ipcRenderer.invoke('fs:explore', dirPath),
  readFileText: (filePath: string) => ipcRenderer.invoke('fs:read', filePath),
  writeFileText: (filePath: string, text: string) => ipcRenderer.invoke('fs:write', filePath, text),
  scanMemory: (folderPath?: string) => ipcRenderer.invoke('memory:scan', folderPath),
  getMemoryStatus: () => ipcRenderer.invoke('memory:status'),
  searchMemory: (query, options) => ipcRenderer.invoke('memory:search', query, options),
  getMemoryCard: (fileId) => ipcRenderer.invoke('memory:card', fileId),
  getMemoryContext: (query, level) => ipcRenderer.invoke('memory:context', query, level),
  listWorkspaceProviders: () => ipcRenderer.invoke('workspace:providers'),
  getWorkspaceStatus: () => ipcRenderer.invoke('workspace:status'),
  searchWorkspace: (query, options) => ipcRenderer.invoke('workspace:search', query, options),
  getWorkspaceResource: (id, provider) => ipcRenderer.invoke('workspace:resource', id, provider),
  getWorkspaceCard: (id, provider) => ipcRenderer.invoke('workspace:card', id, provider),
  buildWorkspaceContext: (request) => ipcRenderer.invoke('workspace:context', request),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  onar: (actionType: string, data: Record<string, unknown>) => ipcRenderer.invoke('onar:action', actionType, data),
  webLogin: (serverUrl: string, appVersion: string) => ipcRenderer.invoke('auth:web-login', serverUrl, appVersion),
  webSessionUrl: (nextPath?: string) => ipcRenderer.invoke('auth:web-session-url', nextPath),
  onAuthChanged: (callback: () => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('auth:changed', listener);
    return () => ipcRenderer.removeListener('auth:changed', listener);
  },
};

contextBridge.exposeInMainWorld('maxDesktop', api);
