import { DEFAULT_PANTRY } from '@haul/core';
import { parseRecipeText } from '@haul/recipe-parser';
import { FixtureCatalog } from '@haul/retailers';
import { describe, expect, it } from 'vitest';
import { DEMO_CATALOG } from './demo-catalog';
import { buildNeeds, resolveBasket } from './index';

const RECIPE = `Ingredients
- 1 lb ground beef
- 1 large onion
- 1 (28 oz) can crushed tomatoes
- 2 tsp ground cumin
- 1 cup shredded cheddar cheese
- 1 lb spaghetti`;

async function lines() {
  const { needs } = buildNeeds([{ recipe: parseRecipeText(RECIPE) }], DEFAULT_PANTRY);
  return resolveBasket(needs, new FixtureCatalog(DEMO_CATALOG), { locationId: 'demo', pantry: DEFAULT_PANTRY });
}

describe('basket lines', () => {
  it('assigns an aisle from the product category', async () => {
    const byKey = new Map((await lines()).map((l) => [l.need.key, l]));
    expect(byKey.get('ground beef')?.aisle).toBe('Meat & Seafood');
    expect(byKey.get('onion')?.aisle).toBe('Produce');
    expect(byKey.get('crushed tomatoes')?.aisle).toBe('Canned Goods');
    expect(byKey.get('ground cumin')?.aisle).toBe('Spices');
  });

  it('gives each shown option its own pack count', async () => {
    for (const l of await lines()) {
      if (!l.pick) continue;
      expect(l.optionPacks[l.pick.productId]).toBe(l.packs);
      for (const alt of l.alternates) expect(l.optionPacks[alt.productId]).toBeGreaterThan(0);
    }
  });

  it('describes the amount needed', async () => {
    const beef = (await lines()).find((l) => l.need.key === 'ground beef');
    expect(beef?.needText).toMatch(/lb|oz/);
  });
});

describe('near misses', () => {
  it('picks butter, not peanut butter', async () => {
    const { needs } = buildNeeds([{ recipe: parseRecipeText('Ingredients\n- 1 cup unsalted butter, softened') }], DEFAULT_PANTRY);
    const [line] = await resolveBasket(needs, new FixtureCatalog(DEMO_CATALOG), { locationId: 'demo', pantry: DEFAULT_PANTRY });
    expect(line?.pick?.description).toMatch(/Butter Sticks/);
  });

  it('picks an onion, not green onions', async () => {
    const { needs } = buildNeeds([{ recipe: parseRecipeText('Ingredients\n- 1 large onion, diced') }], DEFAULT_PANTRY);
    const [line] = await resolveBasket(needs, new FixtureCatalog(DEMO_CATALOG), { locationId: 'demo', pantry: DEFAULT_PANTRY });
    expect(line?.pick?.description).toMatch(/Yellow Onion/);
  });
});
