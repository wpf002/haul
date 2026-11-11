import { z } from 'zod';

/** Layer 1: what the recipe author wrote, parsed. */
export const ParsedIngredient = z.object({
  raw: z.string(),
  name: z.string(),
  quantity: z.number().positive().nullable(),
  /** Upper bound when the recipe gives a range ("1-2 cloves"). */
  quantityMax: z.number().positive().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
  optional: z.boolean(),
  /** "to taste", "for frying": no buyable amount stated. */
  unmeasured: z.boolean(),
  section: z.string().nullable(),
});
export type ParsedIngredient = z.infer<typeof ParsedIngredient>;

export const ParsedRecipe = z.object({
  title: z.string().nullable(),
  servings: z.number().positive().nullable(),
  sourceUrl: z.string().url().nullable(),
  source: z.enum(['json-ld', 'microdata', 'text', 'llm']),
  ingredients: z.array(ParsedIngredient),
});
export type ParsedRecipe = z.infer<typeof ParsedRecipe>;

/** Layer 2: a buyable need, after pantry filtering and merging across recipes. */
export const ShoppingNeed = z.object({
  key: z.string(),
  name: z.string(),
  /** Amount in the dimension's base unit (g, ml, or count). null = any size. */
  amount: z.number().positive().nullable(),
  dimension: z.enum(['mass', 'volume', 'count', 'unknown']),
  sources: z.array(z.string()),
  flags: z.array(z.enum(['allergen-sensitive', 'infant', 'alcohol', 'optional'])),
});
export type ShoppingNeed = z.infer<typeof ShoppingNeed>;

/** Store stock for one product. Null when the retailer didn't say. */
export const StockLevel = z.enum(['in', 'low', 'out']);
export type StockLevel = z.infer<typeof StockLevel>;

/** Layer 3: a specific retail product. */
export const RetailProduct = z.object({
  retailer: z.enum(['kroger', 'instacart']),
  productId: z.string(),
  upc: z.string().nullable(),
  description: z.string(),
  brand: z.string().nullable(),
  /** Retailer's size string, e.g. "28 oz". */
  sizeText: z.string().nullable(),
  priceCents: z.number().int().nonnegative().nullable(),
  promoPriceCents: z.number().int().nonnegative().nullable(),
  stock: StockLevel.nullable(),
  categories: z.array(z.string()),
  imageUrl: z.string().nullable(),
});
export type RetailProduct = z.infer<typeof RetailProduct>;

export const Confidence = z.enum(['high', 'check', 'ambiguous']);
export type Confidence = z.infer<typeof Confidence>;

/** Store sections, used to group the review screen like a walk through the store. */
export const AISLES = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Canned Goods', 'Spices', 'Frozen', 'Drinks', 'Other'] as const;
export const Aisle = z.enum(AISLES);
export type Aisle = z.infer<typeof Aisle>;

export const BasketLine = z.object({
  need: ShoppingNeed,
  /** The need in friendly units ("1.5 lb"), or null for "any size". */
  needText: z.string().nullable(),
  aisle: Aisle,
  pick: RetailProduct.nullable(),
  packs: z.number().int().positive(),
  score: z.number(),
  confidence: Confidence,
  reason: z.string(),
  alternates: z.array(RetailProduct),
  /** Packs needed per productId, so swapping a product keeps the amount right. */
  optionPacks: z.record(z.string(), z.number().int().positive()),
});
export type BasketLine = z.infer<typeof BasketLine>;

export const PantryProfile = z.object({
  /** Normalized ingredient names the user always has. */
  staples: z.array(z.string()),
  dislikes: z.array(z.string()),
  preferStoreBrand: z.boolean(),
  preferOrganic: z.boolean(),
  brandPrefs: z.record(z.string(), z.string()),
});
export type PantryProfile = z.infer<typeof PantryProfile>;

export const DEFAULT_PANTRY: PantryProfile = {
  staples: ['salt', 'black pepper', 'olive oil', 'vegetable oil', 'water', 'all-purpose flour', 'sugar'],
  dislikes: [],
  preferStoreBrand: false,
  preferOrganic: false,
  brandPrefs: {},
};

export * from './llm';
