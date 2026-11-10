/**
 * Resolver eval. The number that decides whether Haul works:
 * share of recipe lines where the top pick is one a sensible shopper would keep.
 *
 *   pnpm eval                    # offline, against the demo catalog
 *   pnpm eval --live             # real Kroger search (needs KROGER_CLIENT_ID/SECRET), recorded to eval/runs/
 *   pnpm eval --only chili       # one label file
 *
 * Label files live in eval/labels/*.json. See eval/labels/_template.json.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BasketLine, DEFAULT_PANTRY } from '@haul/core';
import { parseRecipeText } from '@haul/recipe-parser';
import { AnthropicReranker, buildNeeds, resolveBasket } from '@haul/resolver';
import { DEMO_CATALOG } from '@haul/resolver/demo';
import { type CatalogAdapter, FixtureCatalog, KrogerClient, RecordingCatalog } from '@haul/retailers';

interface Expect {
  /** Pick passes if its description matches any of these (case-insensitive regex). */
  accept: string[];
  reject?: string[];
  packs?: number;
}
interface Label {
  recipe: string;
  locationId: string;
  servings?: number;
  have?: string[];
  expect: Record<string, Expect>;
  /** Keys the resolver should NOT produce (pantry staples, optional garnish). */
  absent?: string[];
}

const args = process.argv.slice(2);
const live = args.includes('--live');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const dir = import.meta.dirname;

function catalog(): CatalogAdapter {
  const file = join(dir, 'runs', 'catalog-cache.json');
  if (!live) return new FixtureCatalog(DEMO_CATALOG);
  const id = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) throw new Error('--live needs KROGER_CLIENT_ID and KROGER_CLIENT_SECRET in .env');
  return new RecordingCatalog(new KrogerClient({ clientId: id, clientSecret: secret, redirectUri: 'http://localhost' }), file);
}

const re = (s: string) => new RegExp(s, 'i');

function grade(line: BasketLine | undefined, e: Expect): { ok: boolean; why: string } {
  if (!line?.pick) return { ok: false, why: 'no pick' };
  const d = line.pick.description;
  if (!e.accept.some((a) => re(a).test(d))) return { ok: false, why: `wrong product: ${d}` };
  if (e.reject?.some((r) => re(r).test(d))) return { ok: false, why: `rejected product: ${d}` };
  if (e.packs !== undefined && e.packs !== line.packs) return { ok: false, why: `packs ${line.packs}, want ${e.packs}` };
  return { ok: true, why: '' };
}

async function main() {
  const cat = catalog();
  const reranker = process.env.ANTHROPIC_API_KEY && args.includes('--rerank')
    ? new AnthropicReranker(process.env.ANTHROPIC_API_KEY, process.env.RERANK_MODEL ?? 'claude-haiku-5-5')
    : null;

  const files = readdirSync(join(dir, 'labels')).filter((f) => f.endsWith('.json') && !f.startsWith('_') && (!only || f.includes(only)));
  let total = 0;
  let pass = 0;
  const byConf: Record<string, { n: number; ok: number }> = { high: { n: 0, ok: 0 }, check: { n: 0, ok: 0 }, ambiguous: { n: 0, ok: 0 } };
  const failures: string[] = [];

  for (const f of files) {
    const label = JSON.parse(readFileSync(join(dir, 'labels', f), 'utf8')) as Label;
    const recipe = parseRecipeText(readFileSync(join(dir, 'recipes', label.recipe), 'utf8'));
    const { needs } = buildNeeds([{ recipe, servings: label.servings }], DEFAULT_PANTRY, { have: label.have });
    const lines = await resolveBasket(needs, cat, { locationId: label.locationId, pantry: DEFAULT_PANTRY, reranker });

    for (const key of label.absent ?? []) {
      total++;
      if (lines.some((l) => l.need.key === key)) failures.push(`${f} · ${key}: should have been left out`);
      else pass++;
    }
    for (const [key, e] of Object.entries(label.expect)) {
      total++;
      const line = lines.find((l) => l.need.key === key);
      const g = grade(line, e);
      if (line) {
        byConf[line.confidence]!.n++;
        if (g.ok) byConf[line.confidence]!.ok++;
      }
      if (g.ok) pass++;
      else failures.push(`${f} · ${key}: ${line ? g.why : `missing (have: ${lines.map((l) => l.need.key).join(', ')})`}`);
    }
  }

  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
  console.log(`\nHaul eval · ${live ? 'live Kroger' : 'demo catalog'}${reranker ? ' + rerank' : ''}`);
  console.log(`Acceptable without edits: ${pass}/${total} (${pct(pass, total)})   target ≥ 85%`);
  for (const [c, v] of Object.entries(byConf)) console.log(`  ${c.padEnd(9)} ${pct(v.ok, v.n).padStart(6)} of ${v.n}`);
  if (failures.length) console.log(`\nFailures:\n  ${failures.join('\n  ')}`);

  writeFileSync(join(dir, 'runs', `run-${Date.now()}.json`), JSON.stringify({ live, total, pass, byConf, failures }, null, 2));
  process.exitCode = total && pass / total < 0.85 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
