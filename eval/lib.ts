import { join } from 'node:path';
import type { BasketLine } from '@haul/core';
import { DEMO_CATALOG } from '@haul/resolver/demo';
import { type CatalogAdapter, FixtureCatalog, KrogerClient, RecordingCatalog } from '@haul/retailers';

export interface Expect {
  /** Pick passes if its description matches any of these (case-insensitive regex). */
  accept: string[];
  reject?: string[];
  packs?: number;
}

export const runsDir = join(import.meta.dirname, 'runs');

/** Demo catalog offline, or live Kroger search recorded to eval/runs/catalog-cache.json. */
export function catalog(live: boolean): CatalogAdapter {
  if (!live) return new FixtureCatalog(DEMO_CATALOG);
  const id = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) throw new Error('--live needs KROGER_CLIENT_ID and KROGER_CLIENT_SECRET in .env');
  return new RecordingCatalog(new KrogerClient({ clientId: id, clientSecret: secret, redirectUri: 'http://localhost' }), join(runsDir, 'catalog-cache.json'));
}

const re = (s: string) => new RegExp(s, 'i');

export function grade(line: BasketLine | undefined, e: Expect): { ok: boolean; why: string } {
  if (!line?.pick) return { ok: false, why: 'no pick' };
  const d = line.pick.description;
  if (!e.accept.some((a) => re(a).test(d))) return { ok: false, why: `wrong product: ${d}` };
  if (e.reject?.some((r) => re(r).test(d))) return { ok: false, why: `rejected product: ${d}` };
  if (e.packs !== undefined && e.packs !== line.packs) return { ok: false, why: `packs ${line.packs}, want ${e.packs}` };
  return { ok: true, why: '' };
}

export const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
