import type { BasketLine, PantryProfile, ShoppingNeed } from '@haul/core';
import type { CatalogAdapter } from '@haul/retailers';
import type { Reranker } from './rerank';
import { rankCandidates, type Scored, toBasketLine } from './score';

export * from './needs';
export * from './score';
export * from './rerank';
export * from './aisle';

export interface ResolveOptions {
  locationId: string;
  pantry: PantryProfile;
  reranker?: Reranker | null;
  concurrency?: number;
  candidatesPerNeed?: number;
}

/** Search term tweaks so the catalog sees what a shopper would type. */
export function searchTerm(need: ShoppingNeed): string {
  return need.name
    .replace(/\b(boneless|skinless|fresh|large|small|medium|organic)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || need.name;
}

async function resolveOne(need: ShoppingNeed, catalog: CatalogAdapter, opts: ResolveOptions): Promise<BasketLine> {
  const products = await catalog.search(searchTerm(need), { locationId: opts.locationId, limit: opts.candidatesPerNeed ?? 12 });
  let ranked: Scored[] = rankCandidates(need, products, opts.pantry);
  let line = toBasketLine(need, ranked);

  if (opts.reranker && line.confidence !== 'high' && ranked.length > 1) {
    const rr = await opts.reranker.rerank(need, ranked).catch(() => null);
    if (rr) {
      const pos = new Map(rr.order.map((id, i) => [id, i]));
      // Model order first, then the rest in deterministic order. Scores stay deterministic.
      ranked = [...ranked].sort((a, b) => (pos.get(a.product.productId) ?? 99) - (pos.get(b.product.productId) ?? 99));
      line = { ...toBasketLine(need, ranked), confidence: line.confidence === 'ambiguous' ? 'check' : line.confidence };
      line.reason = `${line.reason}; ${rr.reason}`;
    }
  }
  return line;
}

/** Needs -> proposed basket. Never writes to a cart. */
export async function resolveBasket(needs: ShoppingNeed[], catalog: CatalogAdapter, opts: ResolveOptions): Promise<BasketLine[]> {
  const out: BasketLine[] = new Array(needs.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(opts.concurrency ?? 4, needs.length) }, async () => {
    while (next < needs.length) {
      const i = next++;
      out[i] = await resolveOne(needs[i]!, catalog, opts);
    }
  });
  await Promise.all(workers);
  return out;
}
