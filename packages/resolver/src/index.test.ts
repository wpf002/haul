import { DEFAULT_PANTRY } from '@haul/core';
import { parseRecipeText } from '@haul/recipe-parser';
import { FixtureCatalog } from '@haul/retailers';
import { describe, expect, it } from 'vitest';
import { SAMPLE_CATALOG } from './fixtures';
import { buildNeeds, ingredientKey, resolveBasket } from './index';

const CHILI = `Ingredients
- 1 lb ground beef
- 1 large onion, diced
- 4 cloves garlic, minced
- 1 (28 oz) can crushed tomatoes
- 2 (15-ounce) cans kidney beans, drained
- 2 tbsp chili powder
- 1 tsp ground cumin
- 1 tsp kosher salt
- 1 tbsp olive oil
- 1 cup shredded cheddar cheese, for serving
Serves 4`;

describe('needs', () => {
  it('normalizes keys', () => {
    expect(ingredientKey('Scallions')).toBe('green onions');
    expect(ingredientKey('onions')).toBe('onions');
    expect(ingredientKey('large eggs')).toBe('egg');
    expect(ingredientKey('cherries')).toBe('cherry');
  });

  it('drops pantry staples and optional garnish', () => {
    const { needs, excluded } = buildNeeds([{ recipe: parseRecipeText(CHILI) }], DEFAULT_PANTRY);
    const keys = needs.map((n) => n.key);
    expect(keys).toContain('ground beef');
    expect(keys).not.toContain('salt');
    expect(keys).not.toContain('olive oil');
    expect(keys).not.toContain('shredded cheddar cheese');
    expect(excluded.find((e) => e.key === 'shredded cheddar cheese')?.reason).toBe('optional');
  });

  it('scales servings and merges across recipes', () => {
    const r = parseRecipeText(CHILI);
    const { needs } = buildNeeds([{ recipe: r, servings: 8 }, { recipe: r }], DEFAULT_PANTRY);
    const beef = needs.find((n) => n.key === 'ground beef')!;
    expect(beef.amount).toBeCloseTo(453.592 * 3, 0); // 2 lb + 1 lb
    expect(beef.sources).toHaveLength(2);
  });

  it('respects "I already have"', () => {
    const { needs } = buildNeeds([{ recipe: parseRecipeText(CHILI) }], DEFAULT_PANTRY, { have: ['chili powder', 'garlic'] });
    expect(needs.map((n) => n.key)).not.toContain('chili powder');
    expect(needs.map((n) => n.key)).not.toContain('garlic');
  });
});

describe('resolver', () => {
  it('builds a sensible chili basket', async () => {
    const { needs } = buildNeeds([{ recipe: parseRecipeText(CHILI) }], DEFAULT_PANTRY);
    const lines = await resolveBasket(needs, new FixtureCatalog(SAMPLE_CATALOG), { locationId: 'test', pantry: DEFAULT_PANTRY });
    const pick = (k: string) => lines.find((l) => l.need.key === k);

    expect(pick('crushed tomatoes')?.pick?.description).toMatch(/^(Kroger|Hunts) Crushed Tomatoes$/);
    expect(pick('crushed tomatoes')?.packs).toBe(1);
    expect(pick('kidney beans')?.packs).toBe(2);
    expect(pick('ground beef')?.pick?.description).not.toMatch(/Seasoned|Family/);
    expect(pick('chili powder')?.pick?.description).not.toMatch(/Mix/);
    expect(pick('garlic')?.pick?.description).toBe('Garlic');
    // out-of-stock cumin loses to the in-stock one
    expect(pick('ground cumin')?.pick?.brand).toBe('McCormick');
    expect(pick('onion')?.pick?.description).not.toMatch(/Dip/);
  });

  it('marks lines with nothing found as ambiguous', async () => {
    const { needs } = buildNeeds([{ recipe: parseRecipeText('Ingredients\n- 2 tbsp gochujang') }], DEFAULT_PANTRY);
    const [line] = await resolveBasket(needs, new FixtureCatalog(SAMPLE_CATALOG), { locationId: 't', pantry: DEFAULT_PANTRY });
    expect(line?.confidence).toBe('ambiguous');
    expect(line?.pick).toBeNull();
  });

  it('never lets a reranker inject unknown products', async () => {
    const { needs } = buildNeeds([{ recipe: parseRecipeText('Ingredients\n- 1 (28 oz) can crushed tomatoes') }], DEFAULT_PANTRY);
    const lines = await resolveBasket(needs, new FixtureCatalog(SAMPLE_CATALOG), {
      locationId: 't',
      pantry: DEFAULT_PANTRY,
      reranker: { rerank: async () => ({ order: ['999', '2'], reason: 'test' }) },
    });
    expect(['1', '2', '3']).toContain(lines[0]?.pick?.productId);
  });
});
