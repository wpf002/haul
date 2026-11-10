import { askClaudeJson, type ShoppingNeed } from '@haul/core';
import { z } from 'zod';
import type { Scored } from './score';

/**
 * Optional LLM pass over the deterministic ranking. It only reorders candidates we
 * already fetched; it can't invent products and it never does package math.
 */
export interface Reranker {
  rerank(need: ShoppingNeed, candidates: Scored[]): Promise<{ order: string[]; reason: string } | null>;
}

const Out = z.object({ order: z.array(z.string()).min(1), reason: z.string().max(300) });

export class AnthropicReranker implements Reranker {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly f: typeof fetch = fetch,
  ) {}

  async rerank(need: ShoppingNeed, candidates: Scored[]) {
    const list = candidates.slice(0, 8).map((c) => ({
      id: c.product.productId,
      description: c.product.description,
      brand: c.product.brand,
      size: c.product.sizeText,
    }));
    const prompt = [
      'A home cook needs this grocery item for a recipe. Pick the products a sensible shopper would buy, best first.',
      'Prefer the plain form of the ingredient over flavored, prepared, or different products. Ignore price and quantity.',
      `Recipe lines: ${JSON.stringify(need.sources)}`,
      `Ingredient: ${need.name}`,
      `Candidates: ${JSON.stringify(list)}`,
      'Reply with JSON only: {"order": [ids best first, drop clearly wrong ones], "reason": "<=20 words"}',
    ].join('\n');

    const raw = await askClaudeJson({ apiKey: this.apiKey, model: this.model, prompt, maxTokens: 300, fetch: this.f });
    const parsed = Out.safeParse(raw);
    if (!parsed.success) return null;
    // Drop any id the model made up.
    const valid = new Set(list.map((l) => l.id));
    const order = parsed.data.order.filter((id) => valid.has(id));
    return order.length ? { order, reason: parsed.data.reason } : null;
  }
}
