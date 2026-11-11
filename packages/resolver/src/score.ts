import type { BasketLine, Confidence, PantryProfile, RetailProduct, ShoppingNeed } from '@haul/core';
import { formatBase, parseRetailSize, planPacks } from '@haul/units';
import { aisleOf } from './aisle';

const tok = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
/** Plural to singular. Only "-ches/-shes/-xes/-oes/-sses" drop "es"; "limes" must stay "lime", not "lim". */
export const stem = (t: string) => {
  if (/ies$/.test(t)) return t.replace(/ies$/, 'y');
  if (/(ch|sh|x|o|ss)es$/.test(t)) return t.slice(0, -2);
  if (/[^s]s$/.test(t)) return t.slice(0, -1);
  return t;
};

/**
 * Words that turn one product into a different one. If the product has it and the
 * need doesn't, it's probably the wrong item ("tomato" vs "tomato soup").
 */
const IDENTITY_SHIFTERS = [
  'sauce', 'soup', 'mix', 'kit', 'seasoned', 'seasoning', 'flavored', 'chips', 'crackers', 'candy',
  'dressing', 'marinade', 'soda', 'frozen', 'dried', 'powder', 'paste', 'juice', 'snack', 'bar', 'bars',
  'cooked', 'canned', 'smoked', 'breaded', 'spread', 'dip', 'drink', 'baby', 'pet', 'dog', 'cat',
  'cereal', 'cookie', 'cookies', 'cake', 'pie', 'roasted', 'pickled', 'instant', 'lite', 'light', 'imitation', 'sparkling',
  // "butter" vs "peanut butter", "milk" vs "almond milk"
  'peanut', 'almond', 'cashew', 'coconut', 'oat', 'soy',
  // "onion" vs "green onions", "beans" vs "green beans"
  'green',
];
const PHRASE_BONUS = 0.05;
const SHIFT_STEP = 0.18;
const COMBO_RE = /([a-z]+)\s+(?:and|&|with)\s+([a-z]+)/g;

/** True when the need's words appear in order with nothing between them: "fish sauce" in "Premium Fish Sauce". */
function hasPhrase(needTokens: string[], descriptionTokens: string[]): boolean {
  if (!needTokens.length) return false;
  for (let i = 0; i + needTokens.length <= descriptionTokens.length; i++) {
    if (needTokens.every((t, j) => descriptionTokens[i + j] === t)) return true;
  }
  return false;
}

/** "Peas & Carrots" or "Basil and Oregano Parmesan": a combo whose other half the recipe didn't ask for. */
function comboCount(description: string, needSet: Set<string>): number {
  let count = 0;
  for (const m of description.toLowerCase().matchAll(COMBO_RE)) {
    if (!needSet.has(stem(m[1]!)) || !needSet.has(stem(m[2]!))) count++;
  }
  return count;
}

const STORE_BRANDS = ['kroger', 'simple truth', 'simple truth organic', 'private selection', 'home chef', 'heritage farm'];

export interface Scored {
  product: RetailProduct;
  score: number;
  packs: number;
  estimated: boolean;
  parts: Record<string, number>;
  note: string | null;
}

export function scoreCandidate(need: ShoppingNeed, product: RetailProduct, pantry: PantryProfile, cheapestUnitPrice: number | null): Scored {
  const needTokens = tok(need.name).map(stem);
  const prodTokens = new Set(tok(`${product.description} ${product.brand ?? ''}`).map(stem));

  // 1. Name match: share of need words present in the product.
  const matched = needTokens.filter((t) => prodTokens.has(t)).length;
  const nameScore = needTokens.length ? matched / needTokens.length : 0;

  // 2. Identity shift penalty.
  const needSet = new Set(needTokens);
  const shifters = IDENTITY_SHIFTERS.map(stem).filter((w) => prodTokens.has(w) && !needSet.has(w));
  const shiftPenalty = Math.min(0.45, (shifters.length + comboCount(product.description, needSet)) * SHIFT_STEP);
  const phraseBonus = hasPhrase(needTokens, tok(product.description).map(stem)) ? PHRASE_BONUS : 0;

  // 3. Size fit, deterministic.
  const size = parseRetailSize(product.sizeText);
  const plan = planPacks(need.amount, need.dimension, size, need.name);
  let sizeScore = 0.6;
  if (need.amount !== null && plan.provided !== null && !plan.note?.includes('not comparable')) {
    const waste = plan.leftover !== null ? plan.leftover / plan.provided : 0;
    sizeScore = 1 - Math.min(0.6, waste * 0.6) - Math.min(0.3, (plan.packs - 1) * 0.08);
  } else if (need.amount === null) {
    // "any size": prefer the smaller common pack
    sizeScore = size ? 0.8 : 0.6;
  }

  // 4. Stock.
  const stockPenalty = product.inStock === false ? 0.5 : 0;

  // 5. Preferences.
  const brand = (product.brand ?? '').toLowerCase();
  let prefBonus = 0;
  const wanted = pantry.brandPrefs[need.key]?.toLowerCase();
  if (wanted && brand.includes(wanted)) prefBonus += 0.15;
  if (pantry.preferStoreBrand && STORE_BRANDS.some((b) => brand.includes(b))) prefBonus += 0.05;
  if (pantry.preferOrganic && prodTokens.has('organic')) prefBonus += 0.05;

  // 6. Price, tie-breaker only.
  const unitPrice = unitPriceOf(product, plan.packs);
  const priceBonus = cheapestUnitPrice && unitPrice ? 0.05 * (cheapestUnitPrice / unitPrice) : 0;

  const score = 0.55 * nameScore + 0.3 * sizeScore + phraseBonus + prefBonus + priceBonus - shiftPenalty - stockPenalty;
  return {
    product,
    score: Math.round(score * 1000) / 1000,
    packs: plan.packs,
    estimated: plan.estimated,
    parts: { nameScore, sizeScore, phraseBonus, shiftPenalty, stockPenalty, prefBonus, priceBonus },
    note: plan.note,
  };
}

function unitPriceOf(p: RetailProduct, packs: number): number | null {
  const price = p.promoPriceCents ?? p.priceCents;
  return price ? price * packs : null;
}

export function rankCandidates(need: ShoppingNeed, products: RetailProduct[], pantry: PantryProfile): Scored[] {
  const prices = products
    .map((p) => unitPriceOf(p, planPacks(need.amount, need.dimension, parseRetailSize(p.sizeText), need.name).packs))
    .filter((x): x is number => x !== null);
  const cheapest = prices.length ? Math.min(...prices) : null;
  return products.map((p) => scoreCandidate(need, p, pantry, cheapest)).sort((a, b) => b.score - a.score);
}

const isSameItem = (s: Scored) => s.parts.nameScore === 1 && s.parts.shiftPenalty === 0;

export function confidenceOf(need: ShoppingNeed, ranked: Scored[]): Confidence {
  const top = ranked[0];
  if (!top || top.score < 0.45) return 'ambiguous';
  // Allergen, infant, and alcohol lines always get a human look.
  if (need.flags.some((f) => f !== 'optional')) return 'check';
  // Margin is measured against the best runner-up that is a different item. Other brands of the same
  // item (full name match, no identity shift) are interchangeable and score within a few points of the top.
  const rival = ranked.slice(1).find((r) => !isSameItem(r));
  const margin = top.score - (rival?.score ?? 0);
  if (top.score >= 0.75 && margin >= 0.05 && !top.estimated && isSameItem(top)) return 'high';
  return 'check';
}

export function explain(need: ShoppingNeed, s: Scored): string {
  const bits: string[] = [];
  const size = s.product.sizeText ? `${s.product.sizeText}` : 'unknown size';
  const want = need.amount !== null && need.dimension !== 'unknown' ? `need ~${formatBase(need.amount, need.dimension)}` : 'any size';
  bits.push(`${s.packs} × ${size} (${want})`);
  if (s.note) bits.push(s.note);
  if (s.parts.prefBonus! > 0) bits.push('matches your preferences');
  if (s.parts.shiftPenalty! > 0) bits.push('name differs from recipe, check it');
  if (s.product.inStock === false) bits.push('out of stock at this store');
  if (need.flags.includes('allergen-sensitive')) bits.push('allergen: read the label');
  if (need.flags.includes('alcohol')) bits.push('alcohol may not be addable for pickup');
  return bits.join('; ');
}

export function needText(need: ShoppingNeed): string | null {
  if (need.amount === null || need.dimension === 'unknown') return null;
  return need.dimension === 'count' ? `${formatBase(need.amount, need.dimension)} ct` : formatBase(need.amount, need.dimension);
}

export function toBasketLine(need: ShoppingNeed, ranked: Scored[], alternates = 4): BasketLine {
  const top = ranked[0];
  const confidence = confidenceOf(need, ranked);
  const shown = ranked.slice(0, 1 + alternates);
  return {
    need,
    needText: needText(need),
    aisle: aisleOf(need, top?.product ?? null),
    // Ambiguous lines still carry a best guess; the UI leaves them unchecked until confirmed.
    pick: top?.product ?? null,
    packs: top?.packs ?? 1,
    score: top?.score ?? 0,
    confidence,
    reason: top ? explain(need, top) : 'no products found at this store',
    alternates: shown.slice(1).map((r) => r.product),
    optionPacks: Object.fromEntries(shown.map((r) => [r.product.productId, r.packs])),
  };
}

/** A line with no product: Instacart handoff, where the retailer picks. */
export function unresolvedLine(need: ShoppingNeed, reason: string): BasketLine {
  return { need, needText: needText(need), aisle: aisleOf(need, null), pick: null, packs: 1, score: 0, confidence: 'check', reason, alternates: [], optionPacks: {} };
}
