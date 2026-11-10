import { describe, expect, it } from 'vitest';
import { ClaudeRecipeExtractor, extractFromPageText, htmlToText } from './fallback';

const PLAIN_PAGE = `<html><head><title>Weeknight Chili</title><script>var x = 1</script></head>
<body><nav>Home</nav><main><h1>Weeknight Chili</h1><p>My family loves this one.</p>
<h2>Ingredients</h2><ul><li>1 lb ground beef</li><li>1 (28 oz) can crushed tomatoes</li><li>2 tsp chili powder</li></ul>
<h2>Instructions</h2><p>Brown the beef.</p></main><footer>© 2026</footer></body></html>`;

const NO_HEADING = `<html><body><article><h1>Grandma's Soup</h1>
<p>You'll want 2 carrots and 1 onion and 4 cups chicken broth for this.</p></article></body></html>`;

function claudeReply(json: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(json) }] }))) as unknown as typeof fetch;
}

describe('page text fallback', () => {
  it('strips chrome and keeps list items', () => {
    const { title, text } = htmlToText(PLAIN_PAGE);
    expect(title).toBe('Weeknight Chili');
    expect(text).toContain('- 1 lb ground beef');
    expect(text).not.toContain('var x');
    expect(text).not.toContain('Home');
  });

  it('reads ingredients under a heading', () => {
    const r = extractFromPageText(PLAIN_PAGE, 'https://example.com/chili');
    expect(r?.source).toBe('text');
    expect(r?.ingredients.map((i) => i.name)).toEqual(['ground beef', 'crushed tomatoes', 'chili powder']);
  });

  it('returns null without an ingredients heading', () => {
    expect(extractFromPageText(NO_HEADING, null)).toBeNull();
  });
});

describe('llm extractor', () => {
  it('drops lines whose ingredients are not on the page', async () => {
    const f = claudeReply({ title: null, servings: 4, ingredients: ['2 carrots', '1 onion', '4 cups chicken broth', '1 lb saffron'] });
    const r = await new ClaudeRecipeExtractor('k', 'm', f).extract(NO_HEADING, 'https://example.com/soup');
    expect(r?.source).toBe('llm');
    expect(r?.title).toBe("Grandma's Soup");
    expect(r?.ingredients.map((i) => i.name)).toEqual(['carrots', 'onion', 'chicken broth']);
  });

  it('returns null on a malformed reply', async () => {
    const r = await new ClaudeRecipeExtractor('k', 'm', claudeReply({ nope: true })).extract(NO_HEADING, 'https://example.com/soup');
    expect(r).toBeNull();
  });
});
