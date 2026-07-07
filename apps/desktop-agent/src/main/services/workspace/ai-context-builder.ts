import type {
  AiContextRequest,
  AiContextResult,
  ContextResourceRef,
  WorkspaceBudgetLevel,
  WorkspaceMode,
  WorkspaceSearchResult,
} from '../../../shared/workspace';
import { TokenBudgetManager } from '../owner-memory/token-budget';

/** Resolves the OSMEM card (plus optional inline chunks) for a search result. */
export type CardResolver = (result: WorkspaceSearchResult) => Promise<string>;

/**
 * Builds the final AI context for Max, respecting a hard token budget.
 *
 * Given a query, a scope/mode and a set of already-scored resources, it:
 *   1. drops anything not eligible (excluded_from_ai or permission 0 for mode);
 *   2. walks resources by final score, adding OSMEM cards until the budget fills;
 *   3. reports exactly what was included, what was excluded and why.
 *
 * Nothing is embedded or summarized here — it only assembles cards the Memory
 * Engine already produced, keeping the builder cheap and deterministic.
 */
export class AiContextBuilder {
  private readonly tokens = new TokenBudgetManager();

  async build(
    request: AiContextRequest,
    results: WorkspaceSearchResult[],
    resolveCard: CardResolver,
  ): Promise<AiContextResult> {
    const level: WorkspaceBudgetLevel = request.level ?? 'medium';
    const mode: WorkspaceMode = request.mode ?? 'hybrid';
    const maxTokens = this.tokens.budget(level);

    const eligible = results
      .filter((item) => item.scores.permission > 0 && !item.resource.privacy.excludedFromAi)
      .sort((a, b) => b.scores.final - a.scores.final);

    const included: ContextResourceRef[] = [];
    const excluded: ContextResourceRef[] = [];
    const parts: string[] = [];
    let usedTokens = 0;

    for (const item of results) {
      if (!eligible.includes(item)) {
        excluded.push(refFrom(item, item.resource.privacy.excludedFromAi ? 'Escluso dall\'AI dalle impostazioni privacy.' : 'Non consentito nella modalità richiesta.'));
      }
    }

    for (const item of eligible) {
      let card: string;
      try {
        card = await resolveCard(item);
      } catch (error) {
        excluded.push(refFrom(item, error instanceof Error ? error.message : 'Card non disponibile.'));
        continue;
      }
      const cost = this.tokens.estimate(card) + 2;
      if (usedTokens + cost > maxTokens) {
        excluded.push(refFrom(item, 'Budget token esaurito.'));
        continue;
      }
      parts.push(card);
      usedTokens += cost;
      included.push(refFrom(item, 'Incluso nel contesto.'));
    }

    return {
      query: request.query,
      mode,
      context: parts.join('\n\n'),
      usedTokens,
      maxTokens,
      includedResources: included,
      excludedResources: excluded,
      reason: buildReason(included.length, excluded.length, maxTokens, usedTokens),
    };
  }
}

function refFrom(item: WorkspaceSearchResult, reason: string): ContextResourceRef {
  return {
    id: item.resource.id,
    provider: item.resource.provider,
    name: item.resource.name,
    virtualPath: item.resource.virtualPath,
    finalScore: item.scores.final,
    reason,
  };
}

function buildReason(included: number, excluded: number, maxTokens: number, usedTokens: number): string {
  return `Inclusi ${included} risorse (${usedTokens}/${maxTokens} token), escluse ${excluded}.`;
}
