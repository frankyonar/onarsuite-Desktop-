import type { RetrievalScores, WorkspaceMode, WorkspaceResource } from '../../../shared/workspace';

/**
 * Blends the recall signals (semantic + keyword) with the re-ranking signals
 * (recency + permission) into a single ordering score. Weights are intentionally
 * simple and explainable; embeddings will raise `semantic` in Phase 2 without
 * changing this shape.
 */
const WEIGHTS = { semantic: 0.45, keyword: 0.3, recency: 0.15, permission: 0.1 } as const;

const RECENCY_HALF_LIFE_DAYS = 45;

export interface ScoreInput {
  /** Raw keyword score from the underlying index (>= 0). */
  keywordRaw: number;
  /** Largest keyword score seen in the current result set (for normalization). */
  keywordMax: number;
  /** Optional precomputed semantic similarity (0..1). Defaults to 0. */
  semantic?: number;
  resource: WorkspaceResource;
  mode: WorkspaceMode;
}

export function computeScores(input: ScoreInput): RetrievalScores {
  const keyword = input.keywordMax > 0 ? clamp01(input.keywordRaw / input.keywordMax) : 0;
  const semantic = clamp01(input.semantic ?? 0);
  const recency = recencyScore(input.resource.modifiedAt);
  const permission = permissionScore(input.resource, input.mode);
  const final = clamp01(
    WEIGHTS.semantic * semantic +
      WEIGHTS.keyword * keyword +
      WEIGHTS.recency * recency +
      WEIGHTS.permission * permission,
  );
  return { semantic, keyword, recency, permission, final };
}

/** Exponential decay on last-modified time. Undated resources score neutral. */
export function recencyScore(modifiedAt: string): number {
  const modified = Date.parse(modifiedAt);
  if (Number.isNaN(modified)) return 0.5;
  const ageDays = Math.max(0, (Date.now() - modified) / 86_400_000);
  return clamp01(Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS));
}

/**
 * How safe/permitted a resource is for the requested mode. Local-only resources
 * are penalized in cloud mode; anything excluded from AI scores 0 so it never
 * surfaces in a context build.
 */
export function permissionScore(resource: WorkspaceResource, mode: WorkspaceMode): number {
  const p = resource.privacy;
  if (p.excludedFromAi) return 0;
  if (mode === 'cloud' && p.localOnly) return 0.2;
  if (mode === 'cloud' && p.askBeforeCloud) return 0.6;
  return 1;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
