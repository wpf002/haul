import { askClaudeJson, type ParsedIngredient, type ParsedRecipe } from '@haul/core';
import { parse as parseHtml } from 'node-html-parser';
import { z } from 'zod';
import { parseIngredientLine } from './line';
import { parseRecipeText } from './text';

const NOISE_TAGS = 'script, style, noscript, svg, nav, footer, header, aside, form, iframe, button';
/** Page text sent to the model. Ingredient lists sit well inside this on every site we've seen. */
const MAX_PAGE_CHARS = 24_000;
/** A line longer than this is prose, so the ingredient list has ended. */
const MAX_INGREDIENT_CHARS = 140;
const MAX_INGREDIENTS = 60;
const MIN_INGREDIENTS = 2;

/** Visible page text with list items as "- " bullets, plus the best title we can find. */
export function htmlToText(html: string): { title: string | null; text: string } {
  const root = parseHtml(html.replace(/<li\b[^>]*>/gi, '$&- '));
  const title =
    root.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    root.querySelector('h1')?.text.trim() ||
    root.querySelector('title')?.text.trim() ||
    null;
  for (const el of root.querySelectorAll(NOISE_TAGS)) el.remove();
  const body = root.querySelector('main, article') ?? root.querySelector('body') ?? root;
  const text = body.structuredText
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title, text };
}

function plausible(ingredients: ParsedIngredient[]): ParsedIngredient[] {
  const out: ParsedIngredient[] = [];
  for (const ing of ingredients) {
    if (ing.raw.length > MAX_INGREDIENT_CHARS) break;
    out.push(ing);
    if (out.length === MAX_INGREDIENTS) break;
  }
  const measured = out.filter((i) => i.quantity !== null).length;
  return out.length >= MIN_INGREDIENTS && measured * 2 >= out.length ? out : [];
}

/**
 * Free fallback for pages with no structured data: find an "Ingredients" heading in the
 * visible text and parse the list under it. Returns null when there's no such heading.
 */
export function extractFromPageText(html: string, sourceUrl: string | null): ParsedRecipe | null {
  const { title, text } = htmlToText(html);
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^ingredients?\s*:?$/i.test(l));
  if (start < 0) return null;
  const parsed = parseRecipeText(lines.slice(start).join('\n'));
  const ingredients = plausible(parsed.ingredients);
  if (ingredients.length === 0) return null;
  const servings = text.match(/(?:serves|servings|yield|makes)\s*:?\s*(\d{1,3})\b/i);
  return { title, servings: servings ? Number(servings[1]) : null, sourceUrl, source: 'text', ingredients };
}

export interface RecipeExtractor {
  extract(html: string, sourceUrl: string): Promise<ParsedRecipe | null>;
}

const ExtractOut = z.object({
  title: z.string().max(200).nullable(),
  servings: z.number().int().positive().max(200).nullable(),
  ingredients: z.array(z.string().min(1).max(300)).max(MAX_INGREDIENTS),
});

const words = (s: string) => s.toLowerCase().match(/[a-z]{3,}/g) ?? [];

/**
 * Last-resort extraction with Claude for pages with no structured data and no heading
 * we can find. The model only copies lines; our own parser does the quantities. Any line
 * whose ingredient words aren't on the page is dropped, so it can't invent ingredients.
 */
export class ClaudeRecipeExtractor implements RecipeExtractor {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly f: typeof fetch = fetch,
  ) {}

  async extract(html: string, sourceUrl: string): Promise<ParsedRecipe | null> {
    const { title, text } = htmlToText(html);
    const page = text.slice(0, MAX_PAGE_CHARS);
    const prompt = [
      'Below is the visible text of a web page. If it contains a recipe, copy its ingredient lines exactly as written, one string per line, in order.',
      'Do not add, merge, convert, or invent ingredients. Skip headings and instructions.',
      'Reply with JSON only: {"title": string|null, "servings": integer|null, "ingredients": string[]}. If there is no recipe, reply {"title": null, "servings": null, "ingredients": []}.',
      '<page>',
      page,
      '</page>',
    ].join('\n');
    const raw = await askClaudeJson({ apiKey: this.apiKey, model: this.model, prompt, maxTokens: 2000, fetch: this.f });
    const out = ExtractOut.safeParse(raw);
    if (!out.success) return null;

    const pageWords = new Set(words(page));
    const ingredients = out.data.ingredients
      .map((l) => parseIngredientLine(l))
      .filter((ing) => ing.name && words(ing.name).every((w) => pageWords.has(w)));
    if (ingredients.length < MIN_INGREDIENTS) return null;
    return { title: out.data.title ?? title, servings: out.data.servings, sourceUrl, source: 'llm', ingredients };
  }
}
