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
import { DEFAULT_PANTRY } from '@haul/core';
import { parseRecipeText } from '@haul/recipe-parser';
import { AnthropicReranker, buildNeeds, resolveBasket } from '@haul/resolver';
import { catalog, type Expect, grade, pct, runsDir } from './lib';

interface Label {
  recipe: string;
  locationId: string;
  servings?: number;
  have?: string[];
  expect: Record<string, Expect>;
  /** Keys the resolver should NOT produce (pantry staples, optional garnish). */
  absent?: string[];
  /** The demo catalog only stocks the original recipes, so the offline run skips these. */
  liveOnly?: boolean;
}

const args = process.argv.slice(2);
const live = args.includes('--live');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const dir = import.meta.dirname;

async function main() {
  const cat = catalog(live);
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
    if (label.liveOnly && !live) continue;
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

  console.log(`\nHaul eval · ${live ? 'live Kroger' : 'demo catalog'}${reranker ? ' + rerank' : ''}`);
  console.log(`Acceptable without edits: ${pass}/${total} (${pct(pass, total)})   target ≥ 85%`);
  for (const [c, v] of Object.entries(byConf)) console.log(`  ${c.padEnd(9)} ${pct(v.ok, v.n).padStart(6)} of ${v.n}`);
  if (failures.length) console.log(`\nFailures:\n  ${failures.join('\n  ')}`);

  writeFileSync(join(runsDir, `run-${Date.now()}.json`), JSON.stringify({ live, total, pass, byConf, failures }, null, 2));
  process.exitCode = total && pass / total < 0.85 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
