/**
 * Held-out eval: real recipe pages from sites the tuning set never used, labeled before the
 * first run. Not a CI gate. Record the first score; don't tune against these labels.
 *
 *   pnpm eval:holdout              # live Kroger search (needs KROGER_CLIENT_ID/SECRET)
 *   pnpm eval:holdout --only salmon
 *
 * Pages are fetched through Haul's importer and cached in eval/runs/pages/ so reruns
 * see the same HTML. Labels match recipe lines by substring of the source line.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BasketLine, DEFAULT_PANTRY } from '@haul/core';
import { fetchRecipe, recipeFromPage } from '@haul/recipe-parser';
import { buildNeeds, type Excluded, resolveBasket } from '@haul/resolver';
import { catalog, type Expect, grade, pct, runsDir } from './lib';

interface HoldoutLabel {
  url: string;
  locationId: string;
  /** Source-line substring -> what the pick should be. */
  expect: Record<string, Expect>;
  /** Source-line substrings that should not become a cart line (pantry staples, optional). */
  absent: string[];
}

type Stage = 'import' | 'parse' | 'resolve';
interface Miss { recipe: string; line: string; stage: Stage; why: string }

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const labelsDir = join(import.meta.dirname, 'holdout');
const pagesDir = join(runsDir, 'pages');

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');
const fromLine = (sources: string[], sub: string) => sources.some((s) => norm(s).includes(norm(sub)));

async function loadPage(slug: string, url: string): Promise<string> {
  const file = join(pagesDir, `${slug}.html`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const { html } = await fetchRecipe(url);
  mkdirSync(pagesDir, { recursive: true });
  writeFileSync(file, html);
  return html;
}

function whyMissing(sub: string, excluded: Excluded[], lines: BasketLine[]): string {
  const ex = excluded.find((e) => fromLine([e.raw], sub));
  if (ex) return `left out as ${ex.reason} (key "${ex.key}")`;
  return `no need from this line (have: ${lines.map((l) => l.need.key).join(', ')})`;
}

async function main() {
  const cat = catalog(true);
  const files = readdirSync(labelsDir).filter((f) => f.endsWith('.json') && (!only || f.includes(only)));
  let total = 0;
  let pass = 0;
  const misses: Miss[] = [];

  for (const f of files) {
    const slug = f.replace(/\.json$/, '');
    const label = JSON.parse(readFileSync(join(labelsDir, f), 'utf8')) as HoldoutLabel;
    const items = Object.keys(label.expect).length + label.absent.length;
    total += items;

    let html: string;
    try {
      html = await loadPage(slug, label.url);
    } catch (e) {
      misses.push({ recipe: slug, line: '*', stage: 'import', why: `fetch: ${(e as Error).message} (${items} items)` });
      continue;
    }
    const recipe = recipeFromPage(html, label.url);
    if (!recipe) {
      misses.push({ recipe: slug, line: '*', stage: 'import', why: `no recipe found (${items} items)` });
      continue;
    }
    const { needs, excluded } = buildNeeds([{ recipe }], DEFAULT_PANTRY);
    const lines = await resolveBasket(needs, cat, { locationId: label.locationId, pantry: DEFAULT_PANTRY, reranker: null });

    for (const sub of label.absent) {
      const line = lines.find((l) => fromLine(l.need.sources, sub));
      if (line) misses.push({ recipe: slug, line: sub, stage: 'parse', why: `should be left out, became "${line.need.key}"` });
      else pass++;
    }
    for (const [sub, e] of Object.entries(label.expect)) {
      const line = lines.find((l) => fromLine(l.need.sources, sub));
      if (!line) {
        misses.push({ recipe: slug, line: sub, stage: 'parse', why: whyMissing(sub, excluded, lines) });
        continue;
      }
      const g = grade(line, e);
      if (g.ok) pass++;
      else misses.push({ recipe: slug, line: sub, stage: 'resolve', why: `"${line.need.key}" → ${g.why}` });
    }
  }

  const count = (s: Stage) => misses.filter((m) => m.stage === s).length;
  console.log(`\nHaul held-out eval · live Kroger · ${files.length} pages`);
  console.log(`Acceptable without edits: ${pass}/${total} (${pct(pass, total)})`);
  console.log(`  misses: import ${count('import')} · parse/needs ${count('parse')} · resolver ${count('resolve')}`);
  for (const stage of ['import', 'parse', 'resolve'] as const) {
    const list = misses.filter((m) => m.stage === stage);
    if (list.length) console.log(`\n${stage}:\n  ${list.map((m) => `${m.recipe} · ${m.line}: ${m.why}`).join('\n  ')}`);
  }
  writeFileSync(join(runsDir, `holdout-${Date.now()}.json`), JSON.stringify({ total, pass, misses }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
