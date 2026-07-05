import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FileAction, PairingInput } from '../shared/types';
import { DesktopRuntime } from './desktop-runtime';
import { UpdateService } from './services/update-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTOCOL = 'onarsuite-desktop';
const runtime = new DesktopRuntime();
let mainWindow: BrowserWindow | undefined;
const updateService = new UpdateService(() => mainWindow);
let heartbeatTimer: NodeJS.Timeout | undefined;

function createWindow(): void {
  mainWindow = new BrowserWindow({
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

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = undefined; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function focusWindow(): void {
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
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
  ipcMain.handle('files:reveal', (_event, filePath: string) => runtime.revealFile(filePath));
  ipcMain.handle('files:action', (_event, filePath: string, action: FileAction) => runtime.performFileAction(filePath, action));
  ipcMain.handle('audit:list', () => runtime.audit.list());
  ipcMain.handle('sync:now', () => runtime.syncNow());
  ipcMain.handle('app:clear-local-data', () => runtime.clearLocalData());
  ipcMain.handle('update:get-state', () => updateService.getState());
  ipcMain.handle('update:check', () => updateService.checkForUpdates());
  ipcMain.handle('update:download', () => updateService.downloadUpdate());
  ipcMain.handle('update:install', () => updateService.installUpdate());
  ipcMain.handle('chat:send', (_event, input) => runtime.sendChat(input));
  ipcMain.handle('agent:run', (event, input) =>
    runtime.runAgent(input, (streamEvent) => event.sender.send('agent:event', streamEvent)));
  ipcMain.handle('agent:cancel', () => runtime.cancelAgent());
  ipcMain.handle('agent:reset', () => runtime.resetAgent());
  ipcMain.handle('conv:list', () => runtime.listConversations());
  ipcMain.handle('conv:get', (_event, id: string) => runtime.getConversation(id));
  ipcMain.handle('conv:save', (_event, input) => runtime.saveConversation(input));
  ipcMain.handle('conv:new', () => runtime.newConversation());
  ipcMain.handle('conv:select', (_event, id: string) => runtime.selectConversation(id));
  ipcMain.handle('conv:delete', (_event, id: string) => runtime.deleteConversation(id));
  ipcMain.handle('conv:rename', (_event, id: string, title: string) => runtime.renameConversation(id, title));
  ipcMain.handle('conv:title', (_event, id: string) => runtime.titleConversation(id));
  ipcMain.handle('fs:explore', (_event, dirPath?: string) => runtime.explore(dirPath));
  ipcMain.handle('fs:read', (_event, filePath: string) => runtime.readFileText(filePath));
  ipcMain.handle('fs:write', (_event, filePath: string, text: string) => runtime.writeFileText(filePath, text));
  ipcMain.handle('app:open-external', (_event, url: string) => shell.openExternal(url));
  ipcMain.handle('auth:web-session-url', (_event, nextPath?: string) => runtime.webSessionUrl(nextPath));
  ipcMain.handle('onar:action', (_event, actionType: string, data: Record<string, unknown>) => runtime.onarCall(actionType, data ?? {}));
  ipcMain.handle('auth:web-login', (_event, serverUrl: string, appVersion: string) => {
    const base = serverUrl.replace(/\/+$/, '');
    const url = `${base}/desktop/authorize?platform=${process.platform}&app_version=${encodeURIComponent(appVersion)}`;
    return shell.openExternal(url);
  });
}

/** Parse the deep-link callback (onarsuite-desktop://auth?token=...) and pair. */
async function handleDeepLink(url?: string): Promise<void> {
  if (!url) return;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return; }
  if (parsed.protocol !== `${PROTOCOL}:` || parsed.host !== 'auth') return;
  const token = parsed.searchParams.get('token');
  const deviceId = parsed.searchParams.get('device_id');
  if (!token || !deviceId) return;
  try {
    await runtime.applyDeepLinkAuth({
      token,
      deviceId,
      deviceUuid: parsed.searchParams.get('device_uuid') ?? undefined,
      account: parsed.searchParams.get('account') ?? undefined,
      planName: parsed.searchParams.get('plan_name') ?? undefined,
      plan: parsed.searchParams.get('plan') ?? undefined,
      server: parsed.searchParams.get('server') ?? undefined,
    });
    focusWindow();
    mainWindow?.webContents.send('auth:changed');
  } catch (error) {
    console.error('Deep link auth failed', error);
  }
}

function extractDeepLink(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A second launch (e.g. the browser opening the deep link) forwards its argv.
  app.on('second-instance', (_event, argv) => {
    focusWindow();
    void handleDeepLink(extractDeepLink(argv));
  });
  // macOS delivers the protocol via open-url.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    void handleDeepLink(url);
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.onarsuite.desktop');
    Menu.setApplicationMenu(null); // remove the native File/Edit/View/Window bar
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }
    registerIpc();
    createWindow();
    updateService.startBackgroundChecks();
    try {
      await runtime.initialize();
    } catch (error) {
      console.error('OnarSuite Desktop initialization failed', error);
    }
    heartbeatTimer = setInterval(() => void runtime.syncNow(), 60_000);
    // Windows cold-start via protocol delivers the URL in argv.
    void handleDeepLink(extractDeepLink(process.argv));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  updateService.stopBackgroundChecks();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
