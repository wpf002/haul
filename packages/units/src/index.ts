/**
 * Deterministic quantity and package math. No LLM touches anything in here.
 * Base units: mass -> grams, volume -> millilitres, count -> each.
 */

export type Dimension = 'mass' | 'volume' | 'count' | 'unknown';

interface UnitDef {
  canonical: string;
  dimension: Dimension;
  /** Multiplier to the dimension's base unit. */
  toBase: number;
}

const U = (canonical: string, dimension: Dimension, toBase: number): UnitDef => ({
  canonical,
  dimension,
  toBase,
});

const UNIT_TABLE: Record<string, UnitDef> = {};
const alias = (def: UnitDef, ...names: string[]) => {
  for (const n of names) UNIT_TABLE[n] = def;
};

// Volume (US customary)
alias(U('tsp', 'volume', 4.92892), 'tsp', 'tsps', 'teaspoon', 'teaspoons', 't');
alias(U('tbsp', 'volume', 14.7868), 'tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'tbs', 'tbl', 'T');
alias(U('fl oz', 'volume', 29.5735), 'fl oz', 'fl. oz', 'fl. oz.', 'floz', 'fluid ounce', 'fluid ounces');
alias(U('cup', 'volume', 236.588), 'cup', 'cups', 'c');
alias(U('pint', 'volume', 473.176), 'pint', 'pints', 'pt');
alias(U('quart', 'volume', 946.353), 'quart', 'quarts', 'qt');
alias(U('gal', 'volume', 3785.41), 'gallon', 'gallons', 'gal');
alias(U('ml', 'volume', 1), 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres');
alias(U('l', 'volume', 1000), 'l', 'liter', 'liters', 'litre', 'litres');
// Mass
alias(U('g', 'mass', 1), 'g', 'gram', 'grams', 'gr');
alias(U('kg', 'mass', 1000), 'kg', 'kilogram', 'kilograms');
alias(U('oz', 'mass', 28.3495), 'oz', 'ounce', 'ounces');
alias(U('lb', 'mass', 453.592), 'lb', 'lbs', 'pound', 'pounds');
// Count-ish
alias(U('each', 'count', 1), 'each', 'ea', 'ct', 'count', 'piece', 'pieces', 'whole');
alias(U('clove', 'count', 1), 'clove', 'cloves');
alias(U('can', 'count', 1), 'can', 'cans', 'tin', 'tins');
alias(U('jar', 'count', 1), 'jar', 'jars');
alias(U('package', 'count', 1), 'package', 'packages', 'pkg', 'pkgs', 'packet', 'packets', 'box', 'boxes', 'bag', 'bags');
alias(U('bunch', 'count', 1), 'bunch', 'bunches');
alias(U('head', 'count', 1), 'head', 'heads');
alias(U('stalk', 'count', 1), 'stalk', 'stalks', 'rib', 'ribs');
alias(U('sprig', 'count', 1), 'sprig', 'sprigs');
alias(U('slice', 'count', 1), 'slice', 'slices');
alias(U('stick', 'count', 1), 'stick', 'sticks');
alias(U('pinch', 'volume', 0.31), 'pinch', 'pinches');
alias(U('dash', 'volume', 0.62), 'dash', 'dashes');

export function lookupUnit(token: string | null | undefined): UnitDef | null {
  if (!token) return null;
  const t = token.trim().replace(/\.$/, '');
  // Case matters only for t vs T.
  return UNIT_TABLE[t] ?? UNIT_TABLE[t.toLowerCase()] ?? null;
}

export function isUnitToken(token: string): boolean {
  return lookupUnit(token) !== null;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅖': 0.4,
  '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};
const UNICODE_FRACTION_CLASS = Object.keys(UNICODE_FRACTIONS).join('');

/** Normalize "1½" -> "1 1/2", "⅓" -> "1/3", fraction slash -> "/". */
export function normalizeNumerals(s: string): string {
  let out = s.replace(/⁄/g, '/');
  out = out.replace(new RegExp(`(\\d)?([${UNICODE_FRACTION_CLASS}])`, 'g'), (_m, whole, frac) => {
    const v = UNICODE_FRACTIONS[frac as string]!;
    const fracStr = toFractionString(v);
    return whole ? `${whole} ${fracStr}` : fracStr;
  });
  return out;
}

function toFractionString(v: number): string {
  for (const d of [2, 3, 4, 5, 6, 8]) {
    const n = Math.round(v * d);
    if (Math.abs(n / d - v) < 1e-9) return `${n}/${d}`;
  }
  return String(v);
}

/** Parse "1", "1.5", "1/2", "1 1/2". Returns null if not a number. */
export function parseNumber(s: string): number | null {
  const t = s.trim();
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2]);
  m = t.match(/^\d*\.?\d+$/);
  if (m) return Number(t);
  return null;
}

export interface Quantity {
  value: number;
  max: number | null;
  unit: string | null;
  dimension: Dimension;
  /** value converted to base unit, null when unit is unknown or count. */
  base: number | null;
}

export function toBase(value: number, unit: string | null): { base: number | null; dimension: Dimension } {
  const def = lookupUnit(unit);
  if (!def) return { base: unit ? null : value, dimension: unit ? 'unknown' : 'count' };
  return { base: value * def.toBase, dimension: def.dimension };
}

/**
 * Parse a retailer size string like "28 oz", "1 lb", "12 ct", "64 fl oz",
 * "2 ct / 14.5 oz", "6 x 12 fl oz". Returns total base amount.
 */
export function parseRetailSize(size: string | null | undefined): { base: number; dimension: Dimension } | null {
  if (!size) return null;
  const s = normalizeNumerals(size.toLowerCase()).replace(/,/g, '');
  // multipack: "6 x 12 fl oz" or "6 ct / 12 fl oz"
  const multi = s.match(/(\d+)\s*(?:x|ct\s*\/|pk\s*\/|pack\s*\/)\s*(\d*\.?\d+)\s*([a-z. ]+)/);
  if (multi) {
    const inner = parseRetailSize(`${multi[2]} ${multi[3]}`);
    if (inner) return { base: inner.base * Number(multi[1]), dimension: inner.dimension };
  }
  const single = s.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*(fl\.?\s*oz|[a-z]+)/);
  if (!single) return null;
  const n = parseNumber(single[1]!);
  const unit = single[2]!.replace(/\s+/g, ' ').replace('fl. oz', 'fl oz').replace('floz', 'fl oz');
  const def = lookupUnit(unit);
  if (n === null || !def) return null;
  return { base: n * def.toBase, dimension: def.dimension };
}

/**
 * Typical weight of one countable produce item, grams. Used when a recipe
 * says "2 onions" and the store sells onions by the pound.
 */
export const TYPICAL_EACH_GRAMS: Record<string, number> = {
  onion: 250, 'yellow onion': 250, 'red onion': 250, 'white onion': 250, shallot: 40,
  garlic: 5, 'garlic clove': 5, lemon: 100, lime: 65, carrot: 60, potato: 210,
  'russet potato': 300, tomato: 150, 'roma tomato': 85, 'bell pepper': 165,
  jalapeno: 15, avocado: 170, apple: 180, banana: 120, cucumber: 300, zucchini: 200,
  'sweet potato': 200, celery: 40, egg: 50,
};

/** Rough densities g/ml for cross-dimension fallback. Only used with a flag. */
export const DENSITY_G_PER_ML: Record<string, number> = {
  water: 1, milk: 1.03, 'heavy cream': 0.99, butter: 0.96, honey: 1.42, 'olive oil': 0.91,
  'vegetable oil': 0.92, 'all-purpose flour': 0.53, flour: 0.53, sugar: 0.85,
  'brown sugar': 0.93, rice: 0.85, 'rolled oats': 0.36, salt: 1.2, 'kosher salt': 0.6,
  'soy sauce': 1.15, 'maple syrup': 1.32, cheese: 0.45, 'shredded cheese': 0.45,
  parmesan: 0.4, 'grated parmesan': 0.4,
};

export interface PackPlan {
  packs: number;
  /** What the packs provide in base units, when comparable. */
  provided: number | null;
  leftover: number | null;
  /** True when we had to guess (density, typical weight, or unknown size). */
  estimated: boolean;
  note: string | null;
}

/**
 * How many packs of a product cover a need. Pure function, fully tested.
 * @param need amount in base units of needDim (null = "any size, buy one")
 * @param product parsed retail size (null = unknown, buy one)
 * @param name ingredient name, for typical-weight and density lookups
 */
export function planPacks(
  need: number | null,
  needDim: Dimension,
  product: { base: number; dimension: Dimension } | null,
  name: string,
  maxPacks = 12,
): PackPlan {
  if (need === null || !product) {
    return { packs: 1, provided: product?.base ?? null, leftover: null, estimated: need !== null, note: null };
  }
  let needInProductDim = need;
  let estimated = false;
  let note: string | null = null;
  const key = name.toLowerCase();

  if (needDim !== product.dimension) {
    // Spoon-sized amounts (≤3 tbsp) of anything sold by weight: one package covers it.
    if (needDim === 'volume' && need <= 45 && product.dimension === 'mass') {
      return { packs: 1, provided: null, leftover: null, estimated: false, note: null };
    }
    if (needDim === 'count' && product.dimension === 'mass' && TYPICAL_EACH_GRAMS[key]) {
      needInProductDim = need * TYPICAL_EACH_GRAMS[key]!;
      note = `assumed ~${TYPICAL_EACH_GRAMS[key]}g each`;
    } else if (needDim === 'volume' && product.dimension === 'mass' && DENSITY_G_PER_ML[key]) {
      needInProductDim = need * DENSITY_G_PER_ML[key]!;
      note = 'converted volume to weight';
    } else if (needDim === 'mass' && product.dimension === 'volume' && DENSITY_G_PER_ML[key]) {
      needInProductDim = need / DENSITY_G_PER_ML[key]!;
      note = 'converted weight to volume';
    } else if (product.dimension === 'count' && needDim !== 'count') {
      // e.g. need 400g tomatoes, product "1 ct" can. One pack is the honest default.
      return { packs: 1, provided: null, leftover: null, estimated: true, note: 'sizes not comparable' };
    } else {
      return { packs: 1, provided: null, leftover: null, estimated: true, note: 'sizes not comparable' };
    }
    estimated = true;
  }

  // Tolerate a 5% shortfall so 794g need vs 28oz (793.8g) can = 1 pack.
  const packs = Math.min(maxPacks, Math.max(1, Math.ceil((needInProductDim * 0.95) / product.base)));
  const provided = packs * product.base;
  return {
    packs,
    provided,
    leftover: Math.max(0, provided - needInProductDim),
    estimated,
    note: packs === maxPacks ? `capped at ${maxPacks} packs` : note,
  };
}

/** Format a base amount back into a friendly US unit for display. */
export function formatBase(base: number, dim: Dimension): string {
  const r = (n: number) => (Math.round(n * 10) / 10).toString();
  if (dim === 'mass') return base >= 453.592 ? `${r(base / 453.592)} lb` : `${r(base / 28.3495)} oz`;
  if (dim === 'volume') {
    if (base >= 236.588) return `${r(base / 236.588)} cup`;
    if (base >= 14.7868) return `${r(base / 14.7868)} tbsp`;
    return `${r(base / 4.92892)} tsp`;
  }
  return r(base);
}
