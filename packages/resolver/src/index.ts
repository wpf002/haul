import type { BasketLine, PantryProfile, ShoppingNeed } from '@haul/core';
import type { CatalogAdapter } from '@haul/retailers';
import type { Reranker } from './rerank';
import { rankCandidates, type Scored, toBasketLine, unresolvedLine } from './score';

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

/** The term, then the term with leading words dropped: "dried brown lentils", "brown lentils", "lentils". */
export function fallbackTerms(term: string): string[] {
  const words = term.split(' ');
  return words.map((_, i) => words.slice(i).join(' '));
}

export const OUT_OF_STOCK_REASON = 'out of stock at this store';

/**
 * Catalog search that retries with a shorter term only when the full one finds nothing.
 * A term that finds the item out of stock stops the search: "tahini sauce" out of stock
 * must not fall through to "sauce". Out-of-stock products are dropped from the result.
 */
async function searchWithFallback(need: ShoppingNeed, catalog: CatalogAdapter, opts: ResolveOptions) {
  const query = { locationId: opts.locationId, limit: opts.candidatesPerNeed ?? 12 };
  for (const term of fallbackTerms(searchTerm(need))) {
    const products = await catalog.search(term, query);
    if (!products.length) continue;
    const available = products.filter((p) => p.stock !== 'out');
    return { products: available, allOut: !available.length };
  }
  return { products: [], allOut: false };
}

async function resolveOne(need: ShoppingNeed, catalog: CatalogAdapter, opts: ResolveOptions): Promise<BasketLine> {
  const { products, allOut } = await searchWithFallback(need, catalog, opts);
  if (allOut) return unresolvedLine(need, OUT_OF_STOCK_REASON);
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
