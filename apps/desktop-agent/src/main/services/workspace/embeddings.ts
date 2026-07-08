import { createHash } from 'node:crypto';
import type { MemoryFileRecord } from '../../../shared/types';

/**
 * Produces a fixed-length vector for a text so two texts can be compared by
 * cosine similarity. Phase 2 will swap in a real embedding model behind this
 * same interface; the {@link HashingEmbedder} is a dependency-free, fully
 * offline, deterministic baseline that already lifts the `semantic` retrieval
 * signal off zero.
 */
export interface Embedder {
  readonly dimensions: number;
  embed(text: string): Float32Array;
}

/**
 * Feature-hashing bag-of-words embedder. Each token is hashed into a bucket and
 * accumulated with a signed weight, then the vector is L2-normalized. It is not
 * a learned model — it captures lexical overlap, not deep meaning — but it is
 * deterministic, instant, needs no network, and gives a real cosine signal that
 * rewards shared vocabulary (including sub-word shingles for fuzzy matches).
 */
export class HashingEmbedder implements Embedder {
  constructor(readonly dimensions = 256) {}

  embed(text: string): Float32Array {
    const vector = new Float32Array(this.dimensions);
    const tokens = tokenize(text);
    if (!tokens.length) return vector;

    for (const token of tokens) {
      for (const feature of features(token)) {
        const [bucket, sign] = hashFeature(feature, this.dimensions);
        vector[bucket] += sign;
      }
    }
    return normalize(vector);
  }
}

/** The descriptive text surface a record is embedded from (not its raw body). */
export function recordEmbeddingText(record: MemoryFileRecord): string {
  return [
    record.name,
    record.summaryShort,
    record.summaryLong,
    record.topics.join(' '),
    record.entities.map((entity) => entity.value).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
}

/** A compact [bucket, value] pair list — most buckets are 0, so store only the rest. */
export type SparseVector = Array<[number, number]>;

/** Dense vector -> sparse (non-zero buckets), rounded, for persisting in the index. */
export function toSparse(dense: Float32Array): SparseVector {
  const out: SparseVector = [];
  for (let i = 0; i < dense.length; i++) {
    if (dense[i] !== 0) out.push([i, Math.round(dense[i] * 10000) / 10000]);
  }
  return out;
}

/** Sparse -> dense, to rebuild a stored embedding for cosine comparison. */
export function fromSparse(sparse: SparseVector, dimensions = 256): Float32Array {
  const dense = new Float32Array(dimensions);
  for (const [bucket, value] of sparse) {
    if (bucket >= 0 && bucket < dimensions) dense[bucket] = value;
  }
  return dense;
}

/** Cosine similarity of two L2-normalized vectors, clamped to [0, 1]. */
export function cosine(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < length; i++) dot += a[i] * b[i];
  return dot < 0 ? 0 : dot > 1 ? 1 : dot;
}

function tokenize(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((term) => term.length > 1);
}

/** The token itself plus character tri-grams, so near-misses still overlap. */
function features(token: string): string[] {
  const out = [token];
  if (token.length > 4) {
    for (let i = 0; i <= token.length - 3; i++) out.push(`#${token.slice(i, i + 3)}`);
  }
  return out;
}

function hashFeature(feature: string, dimensions: number): [number, number] {
  const digest = createHash('md5').update(feature).digest();
  const bucket = ((digest[0] << 8) | digest[1]) % dimensions;
  const sign = digest[2] & 1 ? 1 : -1;
  return [bucket, sign];
}

function normalize(vector: Float32Array): Float32Array {
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) vector[i] /= magnitude;
  }
  return vector;
}
