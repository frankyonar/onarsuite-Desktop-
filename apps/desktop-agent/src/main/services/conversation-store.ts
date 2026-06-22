import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AgentMessage, ConsoleItem, Conversation, ConversationMeta } from '../../shared/types';

interface StoredConversation extends Conversation {
  messages: AgentMessage[];
}

/** Local persistence for chat history: UI items + the LLM context per chat. */
export class ConversationStore {
  private readonly file: string;
  private cache?: StoredConversation[];

  constructor(dataDirectory: string) {
    this.file = path.join(dataDirectory, 'conversations.json');
  }

  newId(): string {
    return randomUUID();
  }

  private async readAll(): Promise<StoredConversation[]> {
    if (this.cache) return this.cache;
    try { this.cache = JSON.parse(await readFile(this.file, 'utf8')) as StoredConversation[]; }
    catch { this.cache = []; }
    return this.cache;
  }

  private async writeAll(list: StoredConversation[]): Promise<void> {
    this.cache = list;
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(list, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  async list(): Promise<ConversationMeta[]> {
    return (await this.readAll())
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Conversation | null> {
    const c = (await this.readAll()).find((x) => x.id === id);
    return c ? { id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, items: c.items } : null;
  }

  async getMessages(id: string): Promise<AgentMessage[]> {
    return (await this.readAll()).find((x) => x.id === id)?.messages ?? [];
  }

  /** Upsert items + LLM messages for a conversation. */
  async save(id: string, title: string, items: ConsoleItem[], messages: AgentMessage[]): Promise<ConversationMeta[]> {
    const all = await this.readAll();
    const now = new Date().toISOString();
    const existing = all.find((x) => x.id === id);
    if (existing) {
      existing.items = items;
      existing.messages = messages;
      existing.updatedAt = now;
      if (title) existing.title = title;
    } else {
      all.push({ id, title: title || 'Nuova chat', createdAt: now, updatedAt: now, items, messages });
    }
    await this.writeAll(all);
    return this.list();
  }

  async rename(id: string, title: string): Promise<ConversationMeta[]> {
    const all = await this.readAll();
    const c = all.find((x) => x.id === id);
    if (c) { c.title = title; c.updatedAt = new Date().toISOString(); await this.writeAll(all); }
    return this.list();
  }

  async remove(id: string): Promise<ConversationMeta[]> {
    await this.writeAll((await this.readAll()).filter((x) => x.id !== id));
    return this.list();
  }

  async clear(): Promise<void> {
    this.cache = [];
    await rm(this.file, { force: true });
  }
}
