import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ChatRequest, FileAction, MaxDesktopApi, PairingInput } from '../shared/types';

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
};

contextBridge.exposeInMainWorld('maxDesktop', api);
