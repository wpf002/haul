import type { ParsedRecipe } from '@haul/core';
import { parse as parseHtml } from 'node-html-parser';
import { extractFromPageText } from './fallback';
import { parseIngredientLine } from './line';

export { parseIngredientLine } from './line';
export { parseRecipeText } from './text';
export { ClaudeRecipeExtractor, extractFromPageText, htmlToText, type RecipeExtractor } from './fallback';

type Json = unknown;

function isRecipeNode(node: Record<string, unknown>): boolean {
  const t = node['@type'];
  if (typeof t === 'string') return t === 'Recipe' || t.endsWith('/Recipe');
  if (Array.isArray(t)) return t.some((x) => x === 'Recipe');
  return false;
}

/** Walk any JSON-LD shape (@graph, arrays, nested mainEntity) for a Recipe node. */
export function findRecipeNode(data: Json, depth = 0): Record<string, unknown> | null {
  if (depth > 8 || data === null || typeof data !== 'object') return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const hit = findRecipeNode(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const obj = data as Record<string, unknown>;
  if (isRecipeNode(obj)) return obj;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    if (key in obj) {
      const hit = findRecipeNode(obj[key], depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

export function parseServings(yieldValue: unknown): number | null {
  const values = Array.isArray(yieldValue) ? yieldValue : [yieldValue];
  for (const v of values) {
    if (typeof v === 'number' && v > 0) return v;
    if (typeof v === 'string') {
      const m = v.match(/(\d+)/);
      if (m && Number(m[1]) > 0 && Number(m[1]) < 200) return Number(m[1]);
    }
  }
  return null;
}

function textOf(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) return textOf(v[0]);
  return null;
}

/** Extract a recipe from page HTML. Returns null when the page has no structured recipe. */
export function extractRecipeFromHtml(html: string, sourceUrl: string | null = null): ParsedRecipe | null {
  const root = parseHtml(html, { blockTextElements: { script: true, style: false } });

  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data: Json;
    try {
      // Some sites ship invalid control chars in JSON-LD.
      data = JSON.parse(script.rawText.replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      continue;
    }
    const node = findRecipeNode(data);
    if (!node) continue;
    const lines = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : node.ingredients) as unknown;
    if (!Array.isArray(lines) || lines.length === 0) continue;
    return {
      title: textOf(node.name),
      servings: parseServings(node.recipeYield),
      sourceUrl,
      source: 'json-ld',
      ingredients: lines
        .filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
        .map((l) => parseIngredientLine(l)),
    };
  }

  // Microdata fallback
  const micro = root.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]');
  if (micro.length > 0) {
    const title = root.querySelector('[itemprop="name"]')?.text.trim() ?? null;
    const yieldEl = root.querySelector('[itemprop="recipeYield"]');
    return {
      title,
      servings: parseServings(yieldEl?.getAttribute('content') ?? yieldEl?.text),
      sourceUrl,
      source: 'microdata',
      ingredients: micro.map((el) => parseIngredientLine(el.text)),
    };
  }
  return null;
}

/**
 * Fetch a URL and extract its recipe. SSRF-guarded: http(s) only, every redirect hop
 * re-checked (pass `guard` to add DNS-level checks), size and time capped. Returns
 * recipe null when the page has no structured data so the caller can fall back to LLM.
 */
export async function fetchRecipe(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number; guard?: (u: URL) => Promise<unknown> } = {},
): Promise<{ recipe: ParsedRecipe | null; html: string }> {
  const check = async (u: URL) => {
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http(s) URLs are allowed');
    if (isPrivateHost(u.hostname)) throw new Error('Host not allowed');
    if (opts.guard) await opts.guard(u);
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
  try {
    let current = new URL(url);
    let res: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      await check(current);
      res = await fetch(current, {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: { 'user-agent': 'HaulBot/0.1 (+recipe import)', accept: 'text/html' },
      });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current);
        continue;
      }
      break;
    }
    if (!res || !res.ok) throw new Error(`Fetch failed: ${res?.status ?? 'too many redirects'}`);
    const max = opts.maxBytes ?? 5_000_000;
    const reader = res.body?.getReader();
    if (!reader) throw new Error('Empty body');
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    return { recipe: extractRecipeFromHtml(html, current.toString()), html };
  } finally {
    clearTimeout(timer);
  }
}

/** Structured data when it lists ingredients, else an "Ingredients" heading in the page text. */
export function recipeFromPage(html: string, sourceUrl: string | null, structured: ParsedRecipe | null = extractRecipeFromHtml(html, sourceUrl)): ParsedRecipe | null {
  return (structured?.ingredients.length ? structured : null) ?? extractFromPageText(html, sourceUrl);
}

/**
 * Hostname-level block list. Production should also resolve DNS and check the IP
 * (see apps/api/src/lib/ssrf.ts) since a public name can point at a private address.
 */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (/^(?:127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}
