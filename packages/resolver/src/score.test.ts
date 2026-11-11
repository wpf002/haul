import { DEFAULT_PANTRY, type RetailProduct, type ShoppingNeed } from '@haul/core';
import { describe, expect, it } from 'vitest';
import { ingredientKey } from './needs';
import { confidenceOf, rankCandidates, type Scored, stem } from './score';

const product = (productId: string, description: string, sizeText: string): RetailProduct => ({
  retailer: 'kroger',
  productId,
  upc: null,
  description,
  brand: null,
  sizeText,
  priceCents: 100,
  promoPriceCents: null,
  inStock: true,
  categories: [],
  imageUrl: null,
});

const need = (name: string, amount: number, dimension: ShoppingNeed['dimension']): ShoppingNeed => ({
  key: name,
  name,
  amount,
  dimension,
  sources: [],
  flags: [],
});

describe('stem', () => {
  it('keeps the silent e when dropping a plural s', () => {
    expect(stem('limes')).toBe('lime');
    expect(stem('olives')).toBe('olive');
    expect(stem('tomatoes')).toBe('tomato');
    expect(stem('peaches')).toBe('peach');
    expect(stem('cherries')).toBe('cherry');
    expect(stem('glass')).toBe('glass');
  });
});

// Regression: live Kroger search for "lime" put a 2-liter soda at the top.
describe('rankCandidates', () => {
  it('picks fresh limes over lemon-lime soda', () => {
    const ranked = rankCandidates(
      need('lime', 2, 'count'),
      [
        product('soda', 'Big K® Lemon Lime Caffeine Free Soda Bottle', '2 liter'),
        product('each', 'Fresh Large Limes - Each', '1 each'),
        product('juice', 'Kroger® 100% Lime Juice', '15 fl oz'),
      ],
      DEFAULT_PANTRY,
    );
    expect(ranked[0]?.product.productId).toBe('each');
    expect(ranked[0]?.packs).toBe(2);
  });

  // Regression: "unsalted butter" was aliased to "butter", so salted butter could win.
  it('keeps unsalted butter distinct and ranks it above salted', () => {
    expect(ingredientKey('unsalted butter')).toBe('unsalted butter');
    const ranked = rankCandidates(
      need('unsalted butter', 227, 'mass'),
      [product('salted', 'Private Selection® Grass Fed Salted Butter Block', '8 oz'), product('unsalted', 'Kroger® Unsalted Butter Sticks', '8 oz')],
      DEFAULT_PANTRY,
    );
    expect(ranked[0]?.product.productId).toBe('unsalted');
  });
});

// Regression: live Kroger returns several brands of the same item, so the old top-two margin rule
// kept almost every line out of "high".
describe('confidenceOf', () => {
  const penne = need('penne', 454, 'mass');

  it('rates high when the close runner-up is another brand of the same item', () => {
    const ranked = rankCandidates(penne, [product('kroger', 'Kroger® Penne Rigate Pasta', '16 oz'), product('barilla', 'Barilla® Penne Rigate Pasta', '16 oz')], DEFAULT_PANTRY);
    expect(confidenceOf(penne, ranked)).toBe('high');
  });

  it('stays check when a different item scores close to the top', () => {
    const scored = (id: string, score: number, nameScore: number, shiftPenalty: number): Scored => ({
      product: product(id, id, '16 oz'),
      score,
      packs: 1,
      estimated: false,
      parts: { nameScore, sizeScore: 1, shiftPenalty, stockPenalty: 0, prefBonus: 0, priceBonus: 0 },
      note: null,
    });
    expect(confidenceOf(penne, [scored('penne', 0.9, 1, 0), scored('penne kit', 0.88, 1, 0.18)])).toBe('check');
  });

  it('ranks real vanilla extract above imitation', () => {
    const vanilla = need('vanilla extract', 30, 'volume');
    const ranked = rankCandidates(vanilla, [product('fake', 'Kroger® Clear Imitation Vanilla Extract', '2 fl oz'), product('real', 'Kroger® Pure Vanilla Extract', '2 fl oz')], DEFAULT_PANTRY);
    expect(ranked[0]?.product.productId).toBe('real');
  });
});

// Regressions from the 50-recipe live eval.
describe('rankCandidates on live eval misses', () => {
  const top = (n: ShoppingNeed, products: RetailProduct[]) => rankCandidates(n, products, DEFAULT_PANTRY)[0]?.product.productId;

  it('ranks plain grated parmesan above a basil and oregano blend', () => {
    const parmesan = need('grated parmesan', 50, 'mass');
    expect(top(parmesan, [product('herb', 'Kroger® Basil and Oregano Grated Parmesan Cheese', '8 oz'), product('plain', 'Kroger® Grated Parmesan Cheese', '8 oz')])).toBe('plain');
  });

  it('ranks frozen peas above frozen peas & carrots', () => {
    const peas = need('frozen peas', 280, 'mass');
    expect(top(peas, [product('mix', 'Kroger® Frozen Peas & Carrots', '12 oz'), product('peas', 'Kroger® Frozen Sweet Peas', '12 oz')])).toBe('peas');
  });

  it('ranks fish sauce above a tartar sauce from a fish-fry brand', () => {
    const fishSauce = need('fish sauce', 30, 'volume');
    const tartar = { ...product('tartar', 'Tartar Sauce', '6.76 fl oz'), brand: 'Louisiana Fish Fry' };
    expect(top(fishSauce, [tartar, product('fish', 'Thai Kitchen® Premium Fish Sauce', '6.76 fl oz')])).toBe('fish');
  });

  it('ranks still white wine above sparkling', () => {
    const wine = need('dry white wine', 240, 'volume');
    expect(top(wine, [product('bubbly', 'Cook\'s Sparkling Dry White Wine', '750 ml'), product('still', 'Barefoot Dry White Wine', '750 ml')])).toBe('still');
  });
});
