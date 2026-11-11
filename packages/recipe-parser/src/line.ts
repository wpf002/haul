import type { ParsedIngredient } from '@haul/core';
import { lookupUnit, normalizeNumerals, parseNumber } from '@haul/units';

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)`;
const LEAD_QTY = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|–|—|to)\s*(${NUM}))?\s*`);
const ARTICLE_QTY = /^(?:a|an|one)\s+(?=\S)/i;

const SIZE_WORDS = new Set(['large', 'small', 'medium', 'extra-large', 'jumbo', 'heaping', 'scant', 'level', 'generous', 'big']);

// Prep words stripped from the *front* of the name. Deliberately excludes words that
// are part of real product names: crushed, ground, shredded, grated, smoked, dried.
const LEADING_PREP = [
  'freshly ground', 'freshly grated', 'grated fresh', 'finely chopped', 'roughly chopped', 'coarsely chopped', 'thinly sliced',
  'finely diced', 'finely minced', 'chopped', 'diced', 'minced', 'sliced', 'cubed', 'julienned',
  'softened', 'melted', 'cold', 'warm', 'packed', 'lightly packed', 'firmly packed', 'peeled',
  'trimmed', 'rinsed', 'drained', 'fresh', 'freshly', 'room temperature', 'ripe',
];
const LEADING_PREP_RE = new RegExp(`^(?:(?:${LEADING_PREP.join('|')})\\s+)+`, 'i');

const UNMEASURED_RE = /\b(to taste|as needed|for (?:frying|greasing|dusting|brushing|the pan|deep[- ]frying|serving|garnish(?:ing)?|topping|drizzling))\b/i;
const GARNISH_RE = /\bfor (?:serving|garnish(?:ing)?|topping)\b/i;
const OPTIONAL_RE = /\(\s*optional\s*\)|,?\s*\boptional\b,?/i;

function clean(raw: string): string {
  return normalizeNumerals(raw)
    .replace(/&nbsp;| /g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .replace(/^[\s\-*•·▢☐□◦‣⁃]+/, '')
    .replace(/(\d)([a-zA-Z])/g, (m, d: string, l: string, off: number, str: string) => {
      // "500g" -> "500 g", but leave "1st" alone
      const rest = str.slice(off + 1).match(/^[a-zA-Z]+/)?.[0] ?? '';
      return lookupUnit(rest) ? `${d} ${l}` : m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Try to read a unit at the start of s. Handles two-word units like "fl oz". */
function takeUnit(s: string): { unit: string | null; rest: string } {
  const words = s.split(' ');
  for (const n of [3, 2, 1]) {
    if (words.length < n) continue;
    const candidate = words.slice(0, n).join(' ').replace(/[.,]$/, '');
    const def = lookupUnit(candidate);
    // single letters only count as units when followed by more text
    if (def && !(candidate.length === 1 && words.length === 1)) {
      // don't treat "c" / "t" as a unit when the next word is also a unit-less noun and the
      // letter is likely a typo; acceptable risk, recipes use these abbreviations.
      return { unit: def.canonical, rest: words.slice(n).join(' ') };
    }
  }
  return { unit: null, rest: s };
}

export function parseIngredientLine(raw: string, section: string | null = null): ParsedIngredient {
  let s = clean(raw);
  const notes: string[] = [];

  let optional = false;
  if (OPTIONAL_RE.test(s)) {
    optional = true;
    s = s.replace(OPTIONAL_RE, ' ').replace(/\s+/g, ' ').trim();
  }

  let unmeasured = false;
  const um = s.match(UNMEASURED_RE);
  if (um) {
    unmeasured = true;
    if (GARNISH_RE.test(s)) optional = true;
    notes.push(um[1]!.toLowerCase());
    s = s.replace(UNMEASURED_RE, ' ').replace(/,\s*$/, '').replace(/\s+/g, ' ').trim();
  }

  let quantity: number | null = null;
  let quantityMax: number | null = null;
  const q = s.match(LEAD_QTY);
  if (q) {
    quantity = parseNumber(q[1]!);
    quantityMax = q[2] ? parseNumber(q[2]) : null;
    s = s.slice(q[0].length);
  } else if (ARTICLE_QTY.test(s)) {
    const after = s.replace(ARTICLE_QTY, '');
    if (takeUnit(after).unit) {
      quantity = 1;
      s = after;
    }
  }

  // "1 (28 oz) can tomatoes" -> 28 oz. "2 (15-ounce) cans" -> 30 oz.
  let unit: string | null = null;
  const pkg = s.match(new RegExp(String.raw`^\((${NUM})[\s-]*([a-zA-Z. ]+?)\)\s*`));
  if (pkg) {
    const inner = parseNumber(pkg[1]!);
    const innerUnit = lookupUnit(pkg[2]!.trim());
    const after = takeUnit(s.slice(pkg[0].length));
    if (inner && innerUnit && innerUnit.dimension !== 'count') {
      quantity = (quantity ?? 1) * inner;
      quantityMax = quantityMax ? quantityMax * inner : null;
      unit = innerUnit.canonical;
      s = after.unit ? after.rest : s.slice(pkg[0].length);
    }
  }

  if (!unit) {
    // size adjective between qty and unit: "2 heaping tbsp"
    const firstWord = s.split(' ')[0]?.toLowerCase() ?? '';
    if (SIZE_WORDS.has(firstWord)) {
      const t = takeUnit(s.slice(firstWord.length).trim());
      if (t.unit) {
        notes.push(firstWord);
        unit = t.unit;
        s = t.rest;
      }
    }
  }
  if (!unit && quantity !== null) {
    const t = takeUnit(s);
    unit = t.unit;
    s = t.rest;
  }

  s = s.replace(/^of\s+/i, '');

  // parentheticals become notes: "(about 2 lb)"
  s = s.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return ' ';
  });

  // after the first comma is prep: "onion, diced"
  const comma = s.indexOf(',');
  if (comma >= 0) {
    const tail = s.slice(comma + 1).trim();
    if (tail) notes.push(tail);
    s = s.slice(0, comma);
  }

  // leading size words: "2 large eggs" -> eggs (large)
  let words = s.trim().split(' ');
  while (words.length > 1 && SIZE_WORDS.has(words[0]!.toLowerCase())) notes.push(words.shift()!.toLowerCase());
  s = words.join(' ');

  // A canned or jarred item's name is its product name: "1 (14.5 oz) can diced tomatoes" keeps "diced".
  const prep = pkg ? null : s.match(LEADING_PREP_RE);
  if (prep && prep[0].trim().length < s.length) {
    notes.push(prep[0].trim().toLowerCase());
    s = s.slice(prep[0].length);
  }

  // alternatives: "butter or margarine" -> butter
  const or = s.match(/^(.+?)\s+or\s+(.+)$/i);
  if (or) {
    notes.push(`or ${or[2]}`);
    s = or[1]!;
  }

  words = s.trim().split(' ');
  s = words.join(' ').replace(/[.;:]+$/, '').trim();

  return {
    raw,
    name: s.toLowerCase() || clean(raw).toLowerCase(),
    quantity: quantity && quantity > 0 ? quantity : null,
    quantityMax: quantityMax && quantityMax > 0 ? quantityMax : null,
    unit,
    notes: notes.length ? notes.join('; ') : null,
    optional,
    unmeasured: unmeasured || (quantity === null && unit === null),
    section,
  };
}
