import { app, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MVP_SCOPES } from '../../shared/types';

export interface StoredConfig {
  serverUrl: string;
  deviceId?: string;
  deviceUuid?: string;
  deviceName: string;
  accountLabel?: string;
  encryptedToken?: string;
  tokenExpiresAt?: string;
  installationId: string;
  authorizedFolders: string[];
  workspacePath: string;
  permissions: string[];
  lastSyncAt?: string;
}

export class ConfigStore {
  readonly dataDirectory = path.join(app.getPath('userData'), 'max-desktop');
  readonly configPath = path.join(this.dataDirectory, 'config.json');
  readonly workspacePath = path.join(app.getPath('documents'), 'OnarSuite Workspace');

  async read(): Promise<StoredConfig> {
    await this.ensureDirectories();
    try {
      const raw = await readFile(this.configPath, 'utf8');
      return { ...this.defaults(), ...JSON.parse(raw) } as StoredConfig;
    } catch {
      const initial = this.defaults();
      await this.write(initial);
      return initial;
    }
  }

  async update(patch: Partial<StoredConfig>): Promise<StoredConfig> {
    const next = { ...(await this.read()), ...patch };
    await this.write(next);
    return next;
  }

  async saveToken(token: string): Promise<boolean> {
    if (!safeStorage.isEncryptionAvailable()) return false;
    await this.update({ encryptedToken: safeStorage.encryptString(token).toString('base64') });
    return true;
  }

  async getToken(): Promise<string | undefined> {
    const config = await this.read();
    if (!config.encryptedToken || !safeStorage.isEncryptionAvailable()) return undefined;
    try {
      return safeStorage.decryptString(Buffer.from(config.encryptedToken, 'base64'));
    } catch {
      return undefined;
    }
  }

  async clearPairing(): Promise<StoredConfig> {
    return this.update({
      deviceId: undefined,
      deviceUuid: undefined,
      accountLabel: undefined,
      encryptedToken: undefined,
      tokenExpiresAt: undefined,
      lastSyncAt: undefined,
    });
  }

  async clearAll(): Promise<void> {
    await rm(this.dataDirectory, { recursive: true, force: true });
  }

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  private defaults(): StoredConfig {
    return {
      serverUrl: 'https://onarsuite.com',
      deviceName: `${process.env.COMPUTERNAME || process.env.HOSTNAME || 'Computer'} - Max Desktop`,
      installationId: randomUUID(),
      authorizedFolders: [],
      workspacePath: this.workspacePath,
      permissions: [...MVP_SCOPES],
    };
  }

  private async ensureDirectories(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    await mkdir(this.workspacePath, { recursive: true });
  }

  private async write(config: StoredConfig): Promise<void> {
    await this.ensureDirectories();
    const tempPath = `${this.configPath}.tmp`;
    await writeFile(tempPath, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rm(this.configPath, { force: true });
    await writeFile(this.configPath, await readFile(tempPath));
    await rm(tempPath, { force: true });
  }
}
