import type { z } from 'zod';

/**
 * Browser storage for per-viewer conveniences (the recipes in progress, a review
 * waiting on a Kroger sign-in). Storage can be missing or full; both are non-fatal.
 */
export function readStored<T>(kind: 'local' | 'session', key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T | null {
  try {
    const raw = (kind === 'local' ? localStorage : sessionStorage).getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (e) {
    console.warn(`haul: could not read ${key}`, e);
    return null;
  }
}

export function writeStored(kind: 'local' | 'session', key: string, value: unknown): void {
  try {
    const s = kind === 'local' ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`haul: could not save ${key}`, e);
  }
}

/** The Kroger store last picked, shared by the cart and pantry screens. */
export const STORE_KEY = 'haul.v1.store';
