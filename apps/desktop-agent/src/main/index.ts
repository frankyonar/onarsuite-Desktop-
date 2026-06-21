import { app, BrowserWindow, ipcMain, shell } from 'electron';
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
    title: 'OnarSuite',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  window.on('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

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
  ipcMain.handle('agent:run', (event, input) =>
    runtime.runAgent(input, (streamEvent) => event.sender.send('agent:event', streamEvent)));
  ipcMain.handle('agent:cancel', () => runtime.cancelAgent());
  ipcMain.handle('agent:reset', () => runtime.resetAgent());
  ipcMain.handle('fs:explore', (_event, dirPath?: string) => runtime.explore(dirPath));
  ipcMain.handle('fs:read', (_event, filePath: string) => runtime.readFileText(filePath));
  ipcMain.handle('fs:write', (_event, filePath: string, text: string) => runtime.writeFileText(filePath, text));
  ipcMain.handle('app:open-external', (_event, url: string) => shell.openExternal(url));
}

/** Lock down and route the embedded OnarSuite <webview>. */
function configureWebviews(): void {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;
    // Auth popups (Google OAuth, Stripe, etc.) open as child windows; any
    // other external link opens in the user's real browser.
    contents.setWindowOpenHandler(({ url }) => {
      if (/accounts\.google\.com|oauth|login\.microsoftonline|stripe\.com|paypal\.com|facebook\.com|connect\./i.test(url)) {
        return { action: 'allow' };
      }
      if (/^https?:/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.onarsuite.desktop');
  registerIpc();
  configureWebviews();
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
