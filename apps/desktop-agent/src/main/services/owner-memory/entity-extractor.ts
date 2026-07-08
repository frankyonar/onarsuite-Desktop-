import type { MemoryEntity } from '../../../shared/types';

/**
 * Pulls structured entities out of a document's text so the Memory Engine builds
 * a lightweight knowledge graph instead of leaving `entities` empty. Entities
 * are weighted heavily in retrieval and feed the semantic surface, so a file
 * that mentions `mario@rossi.it`, `€1.200` or `P.IVA 01234567890` becomes
 * findable by those exact tokens. Extraction is regex-based, deterministic and
 * offline — no model, no network.
 */

const MAX_ENTITIES = 40;
const MAX_PER_TYPE = 12;

interface Rule {
  type: string;
  pattern: RegExp;
  normalize?: (raw: string) => string;
}

const RULES: Rule[] = [
  { type: 'email', pattern: /[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}/gu, normalize: (v) => v.toLowerCase() },
  { type: 'url', pattern: /https?:\/\/[^\s<>()"']+/gu, normalize: stripTrailingPunctuation },
  // Italian VAT (Partita IVA): 11 digits, optionally prefixed.
  { type: 'vat', pattern: /\b(?:p\.?\s?iva|partita iva|vat)\.?\s*:?\s*(?:it)?\s*(\d{11})\b/giu, normalize: (v) => v.replace(/\D/g, '') },
  // IBAN (loose): country + 2 check digits + up to 30 alnum.
  { type: 'iban', pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gu, normalize: (v) => v.toUpperCase() },
  // Money: € / EUR / $ with a number (either order).
  { type: 'money', pattern: /(?:€|eur|\$|usd|£|gbp)\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|eur|\$|usd|£|gbp)\b/giu, normalize: (v) => v.replace(/\s+/g, ' ').trim() },
  // Dates: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, or ISO yyyy-mm-dd.
  { type: 'date', pattern: /\b(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/gu },
  // Phone: + or 00 prefix or Italian-style groups, 8-15 digits total.
  { type: 'phone', pattern: /(?:\+|00)\d[\d\s().-]{7,16}\d|\b0\d{1,3}[\s.-]?\d{5,10}\b/gu, normalize: (v) => v.replace(/[^\d+]/g, '') },
  // Document references: #1234, N.1234, prot. 1234.
  { type: 'ref', pattern: /(?:#|n\.?[°º]?\s*|prot\.?\s*)(\d{2,})/giu, normalize: (v) => v.replace(/^[^\d]*/, '#') },
];

export function extractEntities(text: string): MemoryEntity[] {
  if (!text) return [];
  const seen = new Set<string>();
  const perType = new Map<string, number>();
  const entities: MemoryEntity[] = [];

  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      const raw = (match[1] ?? match[0]).trim();
      if (!raw) continue;
      const value = (rule.normalize ? rule.normalize(raw) : raw).slice(0, 120);
      if (value.length < 3) continue;
      const key = `${rule.type}:${value.toLowerCase()}`;
      if (seen.has(key)) continue;
      const count = perType.get(rule.type) ?? 0;
      if (count >= MAX_PER_TYPE) continue;
      seen.add(key);
      perType.set(rule.type, count + 1);
      entities.push({ type: rule.type, value });
      if (entities.length >= MAX_ENTITIES) return entities;
    }
  }
  return entities;
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?)"'\]]+$/, '');
}
