import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { AuditEntry, LogLevel } from '../../shared/types';

export class AuditLog {
  private readonly logPath: string;

  constructor(dataDirectory: string) {
    this.logPath = path.join(dataDirectory, 'audit.jsonl');
  }

  async write(
    eventType: string,
    level: LogLevel,
    message: string,
    metadata?: AuditEntry['metadata'],
  ): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      eventType,
      level,
      message,
      metadata,
    };
    await mkdir(path.dirname(this.logPath), { recursive: true });
    await appendFile(this.logPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
    return entry;
  }

  async list(limit = 200): Promise<AuditEntry[]> {
    try {
      const content = await readFile(this.logPath, 'utf8');
      return content
        .split('\n')
        .filter(Boolean)
        .slice(-limit)
        .reverse()
        .map((line) => JSON.parse(line) as AuditEntry);
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    await rm(this.logPath, { force: true });
  }
}
