import type { PantryProfile, ParsedIngredient, ParsedRecipe, ShoppingNeed } from '@haul/core';
import { toBase } from '@haul/units';

/** Words that mean the same buyable thing. Left side -> canonical key. */
const SYNONYMS: Record<string, string> = {
  'garlic clove': 'garlic', 'garlic cloves': 'garlic', 'cloves garlic': 'garlic',
  scallion: 'green onions', scallions: 'green onions', 'spring onions': 'green onions', 'green onion': 'green onions',
  'cilantro leaves': 'cilantro', coriander: 'cilantro', 'fresh cilantro': 'cilantro',
  'flat-leaf parsley': 'parsley', 'italian parsley': 'parsley',
  'all purpose flour': 'all-purpose flour', flour: 'all-purpose flour',
  'granulated sugar': 'sugar', 'white sugar': 'sugar',
  'extra virgin olive oil': 'olive oil', 'extra-virgin olive oil': 'olive oil',
  eggs: 'egg', 'large eggs': 'egg',
  'ground black pepper': 'black pepper', pepper: 'black pepper',
  'kosher salt': 'salt', 'sea salt': 'salt', 'table salt': 'salt',
  'canola oil': 'vegetable oil', 'neutral oil': 'vegetable oil',
};

const SINGULAR_EXCEPTIONS = new Set(['peas', 'oats', 'grits', 'greens', 'chives', 'lentils', 'beans', 'noodles', 'tomatoes', 'potatoes', 'flakes', 'chips', 'crumbs', 'onions', 'thighs', 'breasts', 'wings', 'sprouts']);

export function ingredientKey(name: string): string {
  let n = name.toLowerCase().replace(/[^\p{L}\p{N}\s\-']/gu, ' ').replace(/\s+/g, ' ').trim();
  if (SYNONYMS[n]) return SYNONYMS[n]!;
  const words = n.split(' ');
  const last = words[words.length - 1] ?? '';
  if (!SINGULAR_EXCEPTIONS.has(last)) {
    if (/ies$/.test(last)) words[words.length - 1] = last.replace(/ies$/, 'y');
    else if (/(ches|shes|xes|oes)$/.test(last)) words[words.length - 1] = last.replace(/es$/, '');
    else if (/[^s]s$/.test(last)) words[words.length - 1] = last.slice(0, -1);
  }
  n = words.join(' ');
  return SYNONYMS[n] ?? n;
}

const ALLERGEN_RE = /\b(peanut|almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|shrimp|crab|lobster|shellfish|sesame|tahini)s?\b/i;
const INFANT_RE = /\b(baby|infant|formula)\b/i;
const ALCOHOL_RE = /\b(wine|beer|vodka|rum|bourbon|whiskey|whisky|brandy|sherry|tequila|gin|sake|liqueur|cognac|vermouth)\b/i;

export interface NeedsOptions {
  /** Keys the user said they already have, for this cart only. */
  have?: string[];
  includeOptional?: boolean;
  /** Extra allergen terms to force into review, e.g. ['milk', 'egg']. */
  avoid?: string[];
}

export interface Excluded {
  raw: string;
  key: string;
  reason: 'pantry' | 'have' | 'optional' | 'dislike';
}

function coveredByStaple(key: string, staples: string[]): boolean {
  return staples.some((s) => {
    const sk = ingredientKey(s);
    return key === sk;
  });
}

function needAmount(ing: ParsedIngredient, scale: number): { amount: number | null; dimension: ShoppingNeed['dimension'] } {
  if (ing.unmeasured || ing.quantity === null) return { amount: null, dimension: 'unknown' };
  // Buy for the top of a range: "1-2 jalapeños" -> 2.
  const qty = (ing.quantityMax ?? ing.quantity) * scale;
  // Garlic is sold by the head; ~10 cloves per head.
  if (ing.unit === 'clove') return { amount: Math.max(1, Math.ceil(qty / 10)), dimension: 'count' };
  const { base, dimension } = toBase(qty, ing.unit);
  return { amount: base, dimension };
}

/**
 * Recipes -> buyable needs. Applies pantry, "I have this", optional and dislike filters,
 * scales servings, then merges the same ingredient across recipes.
 */
export function buildNeeds(
  recipes: Array<{ recipe: ParsedRecipe; servings?: number }>,
  pantry: PantryProfile,
  opts: NeedsOptions = {},
): { needs: ShoppingNeed[]; excluded: Excluded[] } {
  const have = new Set((opts.have ?? []).map(ingredientKey));
  const dislikes = new Set(pantry.dislikes.map(ingredientKey));
  const avoidRe = opts.avoid?.length ? new RegExp(`\\b(${opts.avoid.map(escape).join('|')})`, 'i') : null;
  const byKey = new Map<string, ShoppingNeed>();
  const excluded: Excluded[] = [];

  for (const { recipe, servings } of recipes) {
    const scale = servings && recipe.servings ? servings / recipe.servings : 1;
    for (const ing of recipe.ingredients) {
      const key = ingredientKey(ing.name);
      if (!key) continue;
      if (dislikes.has(key)) { excluded.push({ raw: ing.raw, key, reason: 'dislike' }); continue; }
      if (have.has(key)) { excluded.push({ raw: ing.raw, key, reason: 'have' }); continue; }
      if (coveredByStaple(key, pantry.staples)) { excluded.push({ raw: ing.raw, key, reason: 'pantry' }); continue; }
      if (ing.optional && !opts.includeOptional) { excluded.push({ raw: ing.raw, key, reason: 'optional' }); continue; }

      const { amount, dimension } = needAmount(ing, scale);
      const flags = new Set<ShoppingNeed['flags'][number]>();
      if (ALLERGEN_RE.test(key) || avoidRe?.test(key)) flags.add('allergen-sensitive');
      if (INFANT_RE.test(key)) flags.add('infant');
      if (ALCOHOL_RE.test(key)) flags.add('alcohol');
      if (ing.optional) flags.add('optional');

      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { key, name: key, amount, dimension, sources: [ing.raw], flags: [...flags] });
        continue;
      }
      existing.sources.push(ing.raw);
      existing.flags = [...new Set([...existing.flags, ...flags])];
      if (existing.amount !== null && amount !== null && existing.dimension === dimension) {
        existing.amount += amount;
      } else if (existing.amount === null && existing.dimension === 'unknown') {
        existing.amount = amount;
        existing.dimension = dimension;
      } else if (amount !== null) {
        // Mixed units we can't add (1 cup + 200 g). Buy by product size, flag via unknown.
        existing.amount = null;
        existing.dimension = 'unknown';
      }
    }
  }
  return { needs: [...byKey.values()], excluded };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
