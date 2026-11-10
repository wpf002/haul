import type { RetailProduct } from '@haul/core';

const p = (productId: string, description: string, brand: string, sizeText: string, price: number, inStock = true, category = ''): RetailProduct => ({
  retailer: 'kroger',
  productId,
  upc: productId.padStart(13, '0'),
  description,
  brand,
  sizeText,
  priceCents: Math.round(price * 100),
  promoPriceCents: null,
  inStock,
  categories: category ? [category] : [],
  imageUrl: null,
});

/** Hand-made catalog that mimics Kroger search results, for tests and the offline eval. */
export { p as fixtureProduct };

export const SAMPLE_CATALOG: RetailProduct[] = [
  p('1', 'Kroger Crushed Tomatoes', 'Kroger', '28 oz', 1.79),
  p('2', 'Hunts Crushed Tomatoes', "Hunt's", '28 oz', 2.49),
  p('3', 'Kroger Fire Roasted Crushed Tomatoes', 'Kroger', '28 oz', 2.29),
  p('4', 'Kroger Tomato Sauce', 'Kroger', '15 oz', 0.99),
  p('5', 'Kroger Diced Tomatoes', 'Kroger', '14.5 oz', 1.09),
  p('10', 'Kroger 80% Lean Ground Beef', 'Kroger', '1 lb', 5.49),
  p('11', 'Kroger 93% Lean Ground Beef', 'Kroger', '1 lb', 6.99),
  p('12', 'Kroger Ground Beef 73% Lean Family Pack', 'Kroger', '3 lb', 13.99),
  p('13', 'Kroger Seasoned Ground Beef Taco Meat', 'Kroger', '16 oz', 6.49),
  p('20', 'Yellow Onions', 'Kroger', '3 lb', 3.49),
  p('21', 'Yellow Onion', 'Kroger', '1 each', 0.99),
  p('22', 'French Onion Dip', 'Kroger', '16 oz', 2.5),
  p('30', 'Kroger Dark Red Kidney Beans', 'Kroger', '15.5 oz', 0.89),
  p('31', 'Bush’s Best Kidney Beans', 'Bushs', '16 oz', 1.39),
  p('40', 'Kroger Chili Powder', 'Kroger', '2.5 oz', 2.29),
  p('41', 'McCormick Chili Powder', 'McCormick', '2.5 oz', 4.29),
  p('42', 'Kroger Chili Seasoning Mix', 'Kroger', '1.25 oz', 0.99),
  p('50', 'Garlic', 'Kroger', '1 each', 0.69),
  p('51', 'Kroger Minced Garlic', 'Kroger', '8 oz', 3.29),
  p('52', 'Garlic Powder', 'Kroger', '3 oz', 2.49),
  p('60', 'Kroger Shredded Sharp Cheddar Cheese', 'Kroger', '8 oz', 2.79),
  p('61', 'Kroger Sharp Cheddar Cheese Block', 'Kroger', '8 oz', 2.79),
  p('70', 'Kroger Ground Cumin', 'Kroger', '1.75 oz', 2.49, false),
  p('71', 'McCormick Ground Cumin', 'McCormick', '1.5 oz', 4.99),
];
