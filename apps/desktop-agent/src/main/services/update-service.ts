import { app, BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateState } from '../../shared/types';

const { autoUpdater } = electronUpdater;

export class UpdateService {
  private state: UpdateState;
  private checking?: Promise<UpdateState>;
  private downloading?: Promise<UpdateState>;
  private silentCheck = false;
  private backgroundTimer?: NodeJS.Timeout;

  constructor(private readonly getWindow: () => BrowserWindow | undefined) {
    this.state = { status: app.isPackaged ? 'idle' : 'disabled', currentVersion: app.getVersion() };
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => {
      if (!this.silentCheck) this.setState({ status: 'checking', currentVersion: app.getVersion() });
    });
    autoUpdater.on('update-not-available', () => this.setState({ status: 'idle', currentVersion: app.getVersion() }));
    autoUpdater.on('update-available', (info) => {
      this.setState({
        status: 'available',
        currentVersion: app.getVersion(),
        availableVersion: info.version,
      });
    });
    autoUpdater.on('download-progress', (progress) => {
      this.setState({
        status: 'downloading',
        currentVersion: app.getVersion(),
        availableVersion: this.state.availableVersion,
        percent: Math.round(progress.percent),
        transferredBytes: progress.transferred,
        totalBytes: progress.total,
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      this.setState({
        status: 'downloaded',
        currentVersion: app.getVersion(),
        availableVersion: info.version,
      });
    });
    autoUpdater.on('error', (error) => {
      this.setState({
        status: 'error',
        currentVersion: app.getVersion(),
        availableVersion: this.state.availableVersion,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  getState(): UpdateState {
    return this.state;
  }

  startBackgroundChecks(intervalMs = 4 * 60 * 60 * 1_000): void {
    if (!app.isPackaged || this.backgroundTimer) return;
    void this.checkForUpdates(true);
    this.backgroundTimer = setInterval(() => void this.checkForUpdates(true), intervalMs);
    this.backgroundTimer.unref();
  }

  stopBackgroundChecks(): void {
    if (this.backgroundTimer) clearInterval(this.backgroundTimer);
    this.backgroundTimer = undefined;
  }

  async checkForUpdates(silent = false): Promise<UpdateState> {
    if (!app.isPackaged) return this.state;
    if (this.checking) return this.checking;

    this.checking = (async () => {
      this.silentCheck = silent;
      try {
        if (!silent) this.setState({ status: 'checking', currentVersion: app.getVersion() });
        await autoUpdater.checkForUpdates();
      } catch (error) {
        this.setState({
          status: 'error',
          currentVersion: app.getVersion(),
          availableVersion: this.state.availableVersion,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.silentCheck = false;
        this.checking = undefined;
      }
      return this.state;
    })();

    return this.checking;
  }

  async downloadUpdate(): Promise<UpdateState> {
    if (!app.isPackaged) return this.state;
    if (this.downloading) return this.downloading;
    if (this.state.status !== 'available' && this.state.status !== 'error') return this.state;
    this.downloading = (async () => {
      this.setState({ ...this.state, status: 'downloading', currentVersion: app.getVersion(), error: undefined, percent: 0, transferredBytes: 0, totalBytes: undefined });
      try {
        await autoUpdater.downloadUpdate();
      } catch (error) {
        this.setState({
          status: 'error',
          currentVersion: app.getVersion(),
          availableVersion: this.state.availableVersion,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.downloading = undefined;
      }
      return this.state;
    })();
    return this.downloading;
  }

  installUpdate(): void {
    if (!app.isPackaged) return;
    if (this.state.status !== 'downloaded') return;
    autoUpdater.quitAndInstall(false, true);
  }

  private setState(next: UpdateState): void {
    this.state = next;
    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update:state-changed', next);
    }
  }
}
