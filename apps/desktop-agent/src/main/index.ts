import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FileAction, PairingInput } from '../shared/types';
import { DesktopRuntime } from './desktop-runtime';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtime = new DesktopRuntime();
let heartbeatTimer: NodeJS.Timeout | undefined;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#f5f6f2',
    title: 'Max Desktop',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.on('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  ipcMain.handle('app:snapshot', () => runtime.snapshot());
  ipcMain.handle('agent:pair', (_event, input: PairingInput) => runtime.pair(input));
  ipcMain.handle('agent:disconnect', () => runtime.disconnect());
  ipcMain.handle('folders:add', () => runtime.addAuthorizedFolder());
  ipcMain.handle('folders:remove', (_event, folderPath: string) => runtime.removeAuthorizedFolder(folderPath));
  ipcMain.handle('files:choose', () => runtime.chooseFiles());
  ipcMain.handle('files:import', (_event, paths: string[]) => runtime.importFiles(paths));
  ipcMain.handle('files:list', () => runtime.listFiles());
  ipcMain.handle('files:parse', (_event, filePath: string) => runtime.parseFile(filePath));
  ipcMain.handle('files:open', (_event, filePath: string) => runtime.openFile(filePath));
  ipcMain.handle('files:action', (_event, filePath: string, action: FileAction) => runtime.performFileAction(filePath, action));
  ipcMain.handle('audit:list', () => runtime.audit.list());
  ipcMain.handle('sync:now', () => runtime.syncNow());
  ipcMain.handle('app:clear-local-data', () => runtime.clearLocalData());
  ipcMain.handle('chat:send', (_event, input) => runtime.sendChat(input));
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.onarsuite.max-desktop');
  registerIpc();
  createWindow();
  try {
    await runtime.initialize();
  } catch (error) {
    console.error('Max Desktop initialization failed', error);
  }
  heartbeatTimer = setInterval(() => void runtime.syncNow(), 60_000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
