import { describe, expect, it } from 'vitest';
import { cosine, fromSparse, HashingEmbedder, toSparse } from './embeddings';

const embedder = new HashingEmbedder();

describe('HashingEmbedder', () => {
  it('is deterministic and L2-normalized', () => {
    const a = embedder.embed('contratto cliente Rossi');
    const b = embedder.embed('contratto cliente Rossi');
    expect(Array.from(a)).toEqual(Array.from(b));
    const magnitude = Math.sqrt(Array.from(a).reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('identical text has cosine ~1, unrelated text much lower', () => {
    const q = embedder.embed('fattura elettronica marzo');
    const same = cosine(q, embedder.embed('fattura elettronica marzo'));
    const other = cosine(q, embedder.embed('ricetta torta al cioccolato'));
    expect(same).toBeCloseTo(1, 5);
    expect(other).toBeLessThan(same);
    expect(other).toBeLessThan(0.5);
  });

  it('rewards partial overlap above unrelated text', () => {
    const q = embedder.embed('preventivo ristrutturazione bagno');
    const overlap = cosine(q, embedder.embed('preventivo per il bagno del cliente'));
    const unrelated = cosine(q, embedder.embed('report vendite trimestrale'));
    expect(overlap).toBeGreaterThan(unrelated);
  });

  it('empty text yields a zero vector (cosine 0)', () => {
    expect(cosine(embedder.embed(''), embedder.embed('qualcosa'))).toBe(0);
  });

  it('sparse round-trip preserves the vector (self-cosine ~1) and is compact', () => {
    const dense = embedder.embed('contratto cliente mario@rossi.it €1.200');
    const sparse = toSparse(dense);
    expect(sparse.length).toBeLessThan(dense.length); // most buckets are 0
    const restored = fromSparse(sparse);
    expect(cosine(dense, restored)).toBeCloseTo(1, 3);
  });

  it('tri-gram shingles catch near-misses (typos/inflections)', () => {
    const q = embedder.embed('contratto');
    // shares the "contratt" stem → some similarity despite different ending
    expect(cosine(q, embedder.embed('contratti'))).toBeGreaterThan(0);
  });
});
