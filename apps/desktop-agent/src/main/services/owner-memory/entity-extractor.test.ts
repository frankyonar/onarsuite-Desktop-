import { describe, expect, it } from 'vitest';
import { extractEntities } from './entity-extractor';

function values(text: string, type: string): string[] {
  return extractEntities(text).filter((e) => e.type === type).map((e) => e.value);
}

describe('extractEntities', () => {
  it('extracts and lowercases emails', () => {
    expect(values('Scrivi a Mario.Rossi@Example.IT per info', 'email')).toEqual(['mario.rossi@example.it']);
  });

  it('extracts money in both orders', () => {
    const m = values('Totale €1.200,00 e acconto 300 EUR', 'money');
    expect(m.some((v) => v.includes('1.200'))).toBe(true);
    expect(m.some((v) => /300/.test(v))).toBe(true);
  });

  it('extracts dates in common formats', () => {
    const d = values('Scadenza 15/03/2026, emesso 2026-03-01', 'date');
    expect(d).toContain('15/03/2026');
    expect(d).toContain('2026-03-01');
  });

  it('extracts an Italian VAT number as 11 digits', () => {
    expect(values('P.IVA: IT 01234567890', 'vat')).toEqual(['01234567890']);
  });

  it('extracts document references', () => {
    expect(values('Fattura #1234 e prot. 5678', 'ref')).toEqual(['#1234', '#5678']);
  });

  it('extracts urls without trailing punctuation', () => {
    expect(values('Vedi https://onarsuite.com/docs.', 'url')).toEqual(['https://onarsuite.com/docs']);
  });

  it('deduplicates and returns [] for empty text', () => {
    expect(extractEntities('')).toEqual([]);
    const emails = values('a@b.it a@b.it A@B.IT', 'email');
    expect(emails).toEqual(['a@b.it']);
  });

  it('caps the number of entities per type', () => {
    const many = Array.from({ length: 30 }, (_, i) => `user${i}@x.it`).join(' ');
    expect(values(many, 'email').length).toBeLessThanOrEqual(12);
  });
});
