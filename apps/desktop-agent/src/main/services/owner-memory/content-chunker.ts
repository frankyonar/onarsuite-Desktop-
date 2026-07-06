import { createHash } from 'node:crypto';
import type { MemoryChunk } from '../../../shared/types';
import { TokenBudgetManager } from './token-budget';

export interface ContentChunker {
  chunk(fileId: string, text: string): MemoryChunk[];
}

export class TextContentChunker implements ContentChunker {
  private readonly tokens = new TokenBudgetManager();

  constructor(private readonly maxCharacters = 4_000) {}

  chunk(fileId: string, text: string): MemoryChunk[] {
    const normalized = text.replace(/\u0000/g, '').trim();
    if (!normalized) return [];

    const chunks: MemoryChunk[] = [];
    let cursor = 0;
    while (cursor < normalized.length) {
      let end = Math.min(cursor + this.maxCharacters, normalized.length);
      if (end < normalized.length) {
        const boundary = Math.max(normalized.lastIndexOf('\n', end), normalized.lastIndexOf(' ', end));
        if (boundary > cursor + this.maxCharacters / 2) end = boundary;
      }
      const chunkText = normalized.slice(cursor, end).trim();
      if (chunkText) {
        const order = chunks.length;
        chunks.push({
          id: `${fileId}:c${order + 1}`,
          fileId,
          order,
          title: `Chunk ${order + 1}`,
          text: chunkText,
          hash: createHash('sha256').update(chunkText).digest('hex'),
          tokenEstimate: this.tokens.estimate(chunkText),
          embeddingStatus: 'not_requested',
        });
      }
      cursor = end;
    }
    return chunks;
  }
}
