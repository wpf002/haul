import { describe, expect, it } from 'vitest';
import { extractRecipeFromHtml, isPrivateHost, parseIngredientLine as p, parseRecipeText, recipeFromPage } from './index';

describe('ingredient lines', () => {
  it.each([
    ['2 cups all-purpose flour', { quantity: 2, unit: 'cup', name: 'all-purpose flour' }],
    ['1 (28 oz) can crushed tomatoes', { quantity: 28, unit: 'oz', name: 'crushed tomatoes' }],
    ['2 (15-ounce) cans black beans, drained and rinsed', { quantity: 30, unit: 'oz', name: 'black beans' }],
    ['3 cloves garlic, minced', { quantity: 3, unit: 'clove', name: 'garlic', notes: 'minced' }],
    ['1½ lb boneless skinless chicken thighs', { quantity: 1.5, unit: 'lb', name: 'boneless skinless chicken thighs' }],
    ['1-2 jalapeños, seeded', { quantity: 1, quantityMax: 2, unit: null, name: 'jalapeños' }],
    ['2 large eggs', { quantity: 2, unit: null, name: 'eggs' }],
    ['500g spaghetti', { quantity: 500, unit: 'g', name: 'spaghetti' }],
    ['1/4 cup chopped fresh parsley', { quantity: 0.25, unit: 'cup', name: 'parsley' }],
    ['1 tbsp grated fresh ginger', { quantity: 1, unit: 'tbsp', name: 'ginger' }],
    ['1/2 cup grated parmesan cheese', { quantity: 0.5, unit: 'cup', name: 'grated parmesan cheese' }],
    ['Freshly ground black pepper, to taste', { quantity: null, name: 'black pepper', unmeasured: true }],
    ['Kosher salt', { quantity: null, name: 'kosher salt', unmeasured: true }],
    ['1 tbsp butter or margarine', { quantity: 1, unit: 'tbsp', name: 'butter' }],
    ['Lime wedges, for serving', { name: 'lime wedges', optional: true, unmeasured: true }],
    ['1/2 tsp red pepper flakes (optional)', { quantity: 0.5, unit: 'tsp', name: 'red pepper flakes', optional: true }],
    ['▢ 2 heaping tbsp tomato paste', { quantity: 2, unit: 'tbsp', name: 'tomato paste' }],
    ['a pinch of nutmeg', { quantity: 1, unit: 'pinch', name: 'nutmeg' }],
    ['1 cup shredded cheddar cheese', { quantity: 1, unit: 'cup', name: 'shredded cheddar cheese' }],
    ['16 fl oz chicken broth', { quantity: 16, unit: 'fl oz', name: 'chicken broth' }],
    // Regressions from the 50-recipe live eval.
    ['1 (14.5 oz) can diced tomatoes', { quantity: 14.5, unit: 'oz', name: 'diced tomatoes' }],
    ['3 ripe bananas, mashed', { quantity: 3, unit: null, name: 'bananas' }],
    ['1 loaf brioche bread', { quantity: 1, unit: 'loaf', name: 'brioche bread' }],
    // Regressions from the held-out eval.
    ['1 Tbsp. + 2 tsp. olive oil (divided)', { unit: 'tbsp', name: 'olive oil' }],
    ['1.5 lb / 750 g chicken thigh fillets', { quantity: 1.5, unit: 'lb', name: 'chicken thigh fillets' }],
    ['1 and 1/3 cups (320ml) warm water', { quantity: 4 / 3, unit: 'cup', name: 'water' }],
    ['3 green onions* sliced', { quantity: 3, name: 'green onions' }],
    ['4 carrots cut into 2-inch chunks', { quantity: 4, name: 'carrots' }],
    ['1 cup chopped fresh cilantro leaves and stems', { name: 'cilantro' }],
    ['1 (14.5 oz) can fire-roasted diced tomatoes', { name: 'fire-roasted diced tomatoes' }],
    ['8 slices thick cut bacon', { name: 'thick cut bacon' }],
    ['Pinch salt', { name: 'salt' }],
    ['1 bulb of fennel, tops removed', { quantity: 1, name: 'fennel' }],
    ['3 cups neutral oil ((for deep-frying; enough for 1½ inches (3.8 cm) of oil in the pot))', { quantity: 3, unit: 'cup', name: 'neutral oil' }],
    ['1 Tbsp olive or avocado oil', { name: 'olive oil' }],
    ['2 tsp smoked or sweet paprika', { name: 'smoked paprika' }],
    ['1 cup long- or short-grain brown rice', { name: 'long-grain brown rice' }],
    ['15 oz canned or frozen corn (drained)', { name: 'frozen corn' }],
    ['Flour or corn tortillas', { name: 'flour tortillas' }],
    ['1 cup milk or heavy cream', { name: 'milk' }],
    ['1 Tbsp green onion or parsley (to garnish)', { name: 'green onion', optional: true }],
    ['1 tablespoon fresh lime juice (plus wedges for serving)', { name: 'lime juice', optional: false }],
  ])('%s', (line, expected) => {
    expect(p(line)).toMatchObject(expected);
  });

  it('adds a second amount joined by +', () => {
    expect(p('1 Tbsp. + 2 tsp. olive oil').quantity).toBeCloseTo(5 / 3);
  });
});

describe('JSON-LD extraction', () => {
  it('finds a Recipe inside @graph', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'x' },
        { '@type': ['Recipe'], name: 'Weeknight Chili', recipeYield: ['6', '6 servings'],
          recipeIngredient: ['1 lb ground beef', '1 (28 oz) can crushed tomatoes', 'salt to taste'] },
      ],
    })}</script></head><body></body></html>`;
    const r = extractRecipeFromHtml(html, 'https://example.com/chili');
    expect(r?.title).toBe('Weeknight Chili');
    expect(r?.servings).toBe(6);
    expect(r?.ingredients).toHaveLength(3);
    expect(r?.ingredients[2]?.unmeasured).toBe(true);
  });
  it('returns null when there is no recipe', () => {
    expect(extractRecipeFromHtml('<html><body>hi</body></html>')).toBeNull();
  });
});

describe('recipeFromPage', () => {
  it('falls back to the page text when the Recipe node lists no ingredients', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Toast' })}</script></head>
      <body><h2>Ingredients</h2><ul><li>2 slices bread</li><li>1 tbsp butter</li></ul><h2>Instructions</h2><p>Toast it.</p></body></html>`;
    expect(recipeFromPage(html, null)?.ingredients.map((i) => i.name)).toEqual(['bread', 'butter']);
  });
});

describe('pasted text', () => {
  it('reads a ChatGPT-style answer', () => {
    const text = `## Creamy Tuscan Chicken
Serves 4

**Ingredients:**
- 1.5 lb chicken breast
- 1 cup heavy cream
- 1/2 cup sun-dried tomatoes

For the garnish:
- fresh basil, for garnish

**Instructions:**
1. Season the chicken.`;
    const r = parseRecipeText(text);
    expect(r.servings).toBe(4);
    expect(r.ingredients.map((i) => i.name)).toEqual(['chicken breast', 'heavy cream', 'sun-dried tomatoes', 'basil']);
    expect(r.ingredients[3]?.section).toBe('garnish');
    expect(r.ingredients[3]?.optional).toBe(true);
    // Bullets are list markup, not part of the ingredient the user sees.
    expect(r.ingredients[0]?.raw).toBe('1.5 lb chicken breast');
  });
});

describe('ssrf guard', () => {
  it('blocks private hosts', () => {
    for (const h of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.0.4', '172.20.1.1', '169.254.169.254', '::1', 'db.internal']) {
      expect(isPrivateHost(h)).toBe(true);
    }
    expect(isPrivateHost('www.seriouseats.com')).toBe(false);
  });
});
