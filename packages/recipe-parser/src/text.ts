import type { ParsedRecipe } from '@haul/core';
import { parseIngredientLine } from './line';

const INGREDIENT_HEADER = /^ingredients?\s*:?$/i;
const STOP_HEADER = /^(?:instructions|directions|method|steps|preparation|how to make|notes|nutrition)\s*:?$/i;
const SECTION_HEADER = /^(?:for the\s+)?([a-z][a-z \-&']{1,40}?)\s*:$/i;
/** Strip markdown emphasis/heading marks so "**Ingredients:**" and "## Method" match. */
/** List markers a pasted list starts lines with. Kept out of `raw` so the UI shows the ingredient only. */
const BULLET = /^[\-*•·▢]\s+/;
const bare = (l: string) => l.replace(/^#+\s*/, '').replace(/[*_]+/g, '').trim();

/**
 * Parse pasted text (a ChatGPT answer, a copied blog section). If an "Ingredients" header
 * exists, only that block is read; otherwise every line that looks like an ingredient is.
 */
export function parseRecipeText(text: string): ParsedRecipe {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const start = lines.findIndex((l) => INGREDIENT_HEADER.test(bare(l)));
  const body = start >= 0 ? lines.slice(start + 1) : lines;
  const titleLine = lines.find((l) => l.length > 0 && !INGREDIENT_HEADER.test(bare(l))) ?? null;

  const ingredients = [];
  let section: string | null = null;
  let seenIngredient = false;
  for (const line of body) {
    if (!line) continue;
    if (STOP_HEADER.test(bare(line))) {
      if (start >= 0 || seenIngredient) break;
      continue;
    }
    const sec = /^[\-*•·▢]\s/.test(line) ? null : bare(line).match(SECTION_HEADER);
    if (sec) {
      section = sec[1]!.trim().toLowerCase();
      continue;
    }
    // numbered steps ("1. Preheat the oven") are instructions, not ingredients
    if (/^\d+[.)]\s+[A-Z]/.test(line) && start < 0) continue;
    const looksLikeIngredient = /^[\-*•·▢]|^\d|^[½⅓⅔¼¾⅛]|^(?:a|an)\s/i.test(line) || start >= 0;
    if (!looksLikeIngredient) continue;
    ingredients.push(parseIngredientLine(line.replace(BULLET, ''), section));
    seenIngredient = true;
  }

  const servingsMatch = text.match(/(?:serves|servings|yield|makes)\s*:?\s*(\d+)/i);
  return {
    title: start > 0 ? titleLine?.replace(/^#+\s*|\*\*/g, '').trim() ?? null : null,
    servings: servingsMatch ? Number(servingsMatch[1]) : null,
    sourceUrl: null,
    source: 'text',
    ingredients,
  };
}
