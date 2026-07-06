import type { MemoryBudgetLevel } from '../../../shared/types';

const TOKEN_BUDGETS: Record<MemoryBudgetLevel, number> = {
  simple: 1_000,
  medium: 4_000,
  advanced: 12_000,
};

export class TokenBudgetManager {
  estimate(text: string): number {
    return Math.ceil(text.length / 4);
  }

  budget(level: MemoryBudgetLevel): number {
    return TOKEN_BUDGETS[level];
  }

  fit(parts: string[], level: MemoryBudgetLevel): { text: string; estimatedTokens: number; truncated: boolean } {
    const maxCharacters = this.budget(level) * 4;
    const selected: string[] = [];
    let used = 0;
    let truncated = false;

    for (const part of parts) {
      const separatorSize = selected.length ? 2 : 0;
      const available = maxCharacters - used - separatorSize;
      if (available <= 0) { truncated = true; break; }
      if (part.length <= available) {
        selected.push(part);
        used += separatorSize + part.length;
      } else {
        selected.push(`${part.slice(0, Math.max(0, available - 15)).trimEnd()}\n[TRUNCATED]`);
        truncated = true;
        break;
      }
    }

    const text = selected.join('\n\n');
    return { text, estimatedTokens: this.estimate(text), truncated };
  }
}
