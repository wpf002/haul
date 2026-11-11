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
  stock: 'in',
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
      parts: { nameScore, sizeScore: 1, shiftPenalty, prefBonus: 0, priceBonus: 0 },
      note: null,
    });
    expect(confidenceOf(penne, [scored('penne', 0.9, 1, 0), scored('penne kit', 0.88, 1, 0.18)])).toBe('check');
  });

  // Low stock may sell out before pickup, so the shopper should look at it.
  it('never rates a low-stock pick high', () => {
    const products = [product('kroger', 'Kroger® Penne Rigate Pasta', '16 oz'), product('barilla', 'Barilla® Penne Rigate Pasta', '16 oz')];
    const ranked = rankCandidates(penne, products.map((p) => ({ ...p, stock: 'low' as const })), DEFAULT_PANTRY);
    expect(confidenceOf(penne, ranked)).toBe('check');
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

// Regressions from the held-out eval.
describe('held-out eval misses', () => {
  it.each([
    ['tumeric powder', 'ground turmeric'],
    ['fine sea salt', 'salt'],
    ['diamond crystal kosher salt', 'salt'],
    ['roasting chicken', 'whole chicken'],
    ['chicken thigh fillets', 'boneless skinless chicken thighs'],
    ['unbleached all-purpose flour', 'all-purpose flour'],
  ])('keys %s as %s', (name, key) => {
    expect(ingredientKey(name)).toBe(key);
  });

  it('ranks a fennel bulb above fennel seeds', () => {
    const fennel = need('fennel', 1, 'count');
    const ranked = rankCandidates(fennel, [product('seeds', 'McCormick® Fennel Seeds', '1.62 oz'), product('bulb', 'Organic Fennel', '1 each')], DEFAULT_PANTRY);
    expect(ranked[0]?.product.productId).toBe('bulb');
  });

  it('ranks fresh parsley above parsley flakes', () => {
    const parsley = need('parsley', 1, 'count');
    const ranked = rankCandidates(parsley, [product('flakes', 'Smart Way™ Parsley Flakes', '0.4 oz'), product('fresh', 'Fresh Italian Parsley', '1 bunch')], DEFAULT_PANTRY);
    expect(ranked[0]?.product.productId).toBe('fresh');
  });

  it('ranks a whole chicken above whole chicken wings', () => {
    const chicken = need('whole chicken', 1, 'count');
    const ranked = rankCandidates(chicken, [product('wings', 'Smart Way™ Fresh Uncooked Whole Chicken Wings', '3.25 lb'), product('bird', 'Miller Poultry Whole Fresh Chicken', '1 lb')], DEFAULT_PANTRY);
    expect(ranked[0]?.product.productId).toBe('bird');
  });
});
