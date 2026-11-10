import type { Aisle, RetailProduct } from '@haul/core';

export const priceOf = (p: RetailProduct | null): number | null => (p ? (p.promoPriceCents ?? p.priceCents) : null);

export const money = (cents: number | null | undefined): string => (cents == null ? '–' : `$${(cents / 100).toFixed(2)}`);

/** Two letters for a product tile when there's no photo. */
export function initials(text: string): string {
  const words = text.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const first = words[0] ?? text;
  const second = words[1];
  return (first[0] ?? '?').toUpperCase() + (second ? second[0]!.toLowerCase() : (first[1] ?? ''));
}

const AISLE_TOKEN: Record<Aisle, string> = {
  Produce: 'produce',
  'Meat & Seafood': 'meat',
  'Dairy & Eggs': 'dairy',
  Bakery: 'bakery',
  Pantry: 'pantry',
  'Canned Goods': 'canned',
  Spices: 'spices',
  Frozen: 'frozen',
  Drinks: 'drinks',
  Other: 'other',
};
export const aisleTint = (a: Aisle): string => `var(--aisle-${AISLE_TOKEN[a]})`;

export const titleCase = (s: string): string => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
