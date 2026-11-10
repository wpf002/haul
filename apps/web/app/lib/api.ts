import { BasketLine, ParsedRecipe } from '@haul/core';
import { z } from 'zod';

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const ErrorBody = z.object({ error: z.string() }).partial();

async function call<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(ErrorBody.safeParse(body).data?.error ?? `Request failed (${res.status})`, res.status);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError('Unexpected response from the server', res.status);
  return parsed.data;
}

export const Config = z.object({ demo: z.boolean(), instacart: z.boolean(), readsAnyPage: z.boolean() });
export type Config = z.infer<typeof Config>;

export const Store = z.object({
  locationId: z.string(),
  name: z.string(),
  chain: z.string().optional(),
  address: z.object({ addressLine1: z.string().optional(), city: z.string().optional(), state: z.string().optional(), zipCode: z.string().optional() }).optional(),
});
export type Store = z.infer<typeof Store>;

export const Excluded = z.object({ raw: z.string(), key: z.string(), reason: z.enum(['pantry', 'have', 'optional', 'dislike']) });
export type Excluded = z.infer<typeof Excluded>;

export const Pantry = z.object({
  staples: z.array(z.string()),
  dislikes: z.array(z.string()),
  preferStoreBrand: z.boolean(),
  preferOrganic: z.boolean(),
  brandPrefs: z.record(z.string(), z.string()),
  krogerLocationId: z.string().nullable(),
  modality: z.enum(['PICKUP', 'DELIVERY']),
});
export type Pantry = z.infer<typeof Pantry>;
export type Modality = Pantry['modality'];
export type Retailer = 'kroger' | 'instacart';

const Basket = z.object({ draftId: z.string(), lines: z.array(BasketLine), excluded: z.array(Excluded) });
export type Basket = z.infer<typeof Basket>;
const KrogerAdded = z.object({ added: z.number(), checkoutUrl: z.string().url(), demo: z.boolean().optional() });
const InstacartList = z.object({ url: z.string().url(), demo: z.boolean().optional() });
const Connected = z.object({ connected: z.boolean() });

const json = (body: unknown) => JSON.stringify(body);

export interface BasketRequest {
  title: string;
  recipes: Array<{ recipe: ParsedRecipe; servings?: number }>;
  have: string[];
  retailer: Retailer;
  locationId?: string;
}

export const api = {
  config: () => call(Config, '/config'),
  importRecipe: (input: { url: string } | { text: string }) => call(ParsedRecipe, '/recipes/import', { method: 'POST', body: json(input) }),
  stores: (zip: string) => call(z.array(Store), `/kroger/locations?zip=${encodeURIComponent(zip)}`),
  krogerStatus: () => call(Connected, '/auth/kroger/status'),
  disconnectKroger: () => call(Connected, '/auth/kroger', { method: 'DELETE' }),
  krogerConnectUrl: (returnTo: string) => `${API}/auth/kroger/start?returnTo=${encodeURIComponent(returnTo)}`,
  pantry: () => call(Pantry, '/pantry'),
  savePantry: (p: Pantry) => call(Pantry, '/pantry', { method: 'PUT', body: json(p) }),
  buildBasket: (body: BasketRequest) => call(Basket, '/baskets', { method: 'POST', body: json(body) }),
  addToKroger: (draftId: string, lines: Array<{ key: string; upc: string; packs: number }>, modality: Modality) =>
    call(KrogerAdded, `/baskets/${encodeURIComponent(draftId)}/kroger`, { method: 'POST', body: json({ lines, modality }) }),
  sendToInstacart: (draftId: string, keys: string[]) => call(InstacartList, `/baskets/${encodeURIComponent(draftId)}/instacart`, { method: 'POST', body: json({ keys }) }),
};
