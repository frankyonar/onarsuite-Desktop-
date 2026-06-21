import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AgentRunInput, AgentStreamEvent, ChatRequest, FileAction, MaxDesktopApi, PairingInput } from '../shared/types';

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
  performFileAction: (filePath: string, action: FileAction) =>
    ipcRenderer.invoke('files:action', filePath, action),
  listAudit: () => ipcRenderer.invoke('audit:list'),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  clearLocalData: () => ipcRenderer.invoke('app:clear-local-data'),
  sendChat: (input: ChatRequest) => ipcRenderer.invoke('chat:send', input),
  runAgent: (input: AgentRunInput) => ipcRenderer.invoke('agent:run', input),
  cancelAgent: () => ipcRenderer.invoke('agent:cancel'),
  onAgentEvent: (callback: (event: AgentStreamEvent) => void) => {
    const listener = (_event: unknown, payload: AgentStreamEvent): void => callback(payload);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
  explore: (dirPath?: string) => ipcRenderer.invoke('fs:explore', dirPath),
  readFileText: (filePath: string) => ipcRenderer.invoke('fs:read', filePath),
  writeFileText: (filePath: string, text: string) => ipcRenderer.invoke('fs:write', filePath, text),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  onar: (actionType: string, data: Record<string, unknown>) => ipcRenderer.invoke('onar:action', actionType, data),
  webLogin: (serverUrl: string, appVersion: string) => ipcRenderer.invoke('auth:web-login', serverUrl, appVersion),
  onAuthChanged: (callback: () => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('auth:changed', listener);
    return () => ipcRenderer.removeListener('auth:changed', listener);
  },
};

contextBridge.exposeInMainWorld('maxDesktop', api);
