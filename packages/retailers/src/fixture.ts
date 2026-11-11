import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { RetailProduct } from '@haul/core';
import type { CatalogAdapter, SearchOptions } from './types';

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1));

/** In-memory catalog for tests and offline evals. Ranks by token overlap. */
export class FixtureCatalog implements CatalogAdapter {
  readonly id = 'kroger' as const;
  constructor(private readonly products: RetailProduct[]) {}
  async search(term: string, opts: SearchOptions): Promise<RetailProduct[]> {
    const q = tokens(term);
    return this.products
      .map((p) => {
        const t = tokens(`${p.description} ${p.brand ?? ''}`);
        let hit = 0;
        for (const w of q) if (t.has(w) || t.has(`${w}s`) || t.has(w.replace(/s$/, ''))) hit++;
        return { p, hit };
      })
      .filter((x) => x.hit > 0)
      .sort((a, b) => b.hit - a.hit)
      .slice(0, opts.limit ?? 12)
      .map((x) => x.p);
  }
}

/**
 * Wraps a live catalog and records every response to disk, keyed by store + term.
 * Eval reruns replay from the file so iteration doesn't burn the daily API quota.
 * Kroger's terms limit retention of product data: keep these files local, out of git
 * (eval/runs is gitignored) and delete them when the eval cycle ends.
 */
export class RecordingCatalog implements CatalogAdapter {
  readonly id: RetailProduct['retailer'];
  private cache: Record<string, RetailProduct[]>;
  constructor(
    private readonly inner: CatalogAdapter | null,
    private readonly file: string,
  ) {
    this.id = inner?.id ?? 'kroger';
    this.cache = existsSync(file) ? validEntries(JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
  }
  async search(term: string, opts: SearchOptions): Promise<RetailProduct[]> {
    const key = `${opts.locationId}::${term.toLowerCase()}`;
    if (this.cache[key]) return this.cache[key]!;
    if (!this.inner) return [];
    const res = await this.inner.search(term, opts);
    this.cache[key] = res;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.cache));
    return res;
  }
}

/** Keeps only cache entries that match the current product shape; the rest are searched again. */
function validEntries(raw: Record<string, unknown>): Record<string, RetailProduct[]> {
  const products = RetailProduct.array();
  const out: Record<string, RetailProduct[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    const parsed = products.safeParse(value);
    if (parsed.success) out[key] = parsed.data;
  }
  return out;
}
