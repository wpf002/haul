import type { BasketLine, ParsedRecipe } from '@haul/core';

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Request failed (${res.status})`), { status: res.status, body });
  return body as T;
}

export interface Store { locationId: string; name: string; address?: { addressLine1?: string; city?: string } }
export interface Excluded { raw: string; key: string; reason: 'pantry' | 'have' | 'optional' | 'dislike' }

export const api = {
  importRecipe: (input: { url: string } | { text: string }) => call<ParsedRecipe>('/recipes/import', { method: 'POST', body: JSON.stringify(input) }),
  stores: (zip: string) => call<Store[]>(`/kroger/locations?zip=${encodeURIComponent(zip)}`),
  krogerStatus: () => call<{ connected: boolean }>('/auth/kroger/status'),
  buildBasket: (body: unknown) =>
    call<{ draftId: string; lines: BasketLine[]; excluded: Excluded[] }>('/baskets', { method: 'POST', body: JSON.stringify(body) }),
  addToKroger: (draftId: string, lines: Array<{ key: string; upc: string; packs: number }>, modality: 'PICKUP' | 'DELIVERY') =>
    call<{ added: number; checkoutUrl: string }>(`/baskets/${draftId}/kroger`, { method: 'POST', body: JSON.stringify({ lines, modality }) }),
  sendToInstacart: (draftId: string, keys: string[]) =>
    call<{ url: string }>(`/baskets/${draftId}/instacart`, { method: 'POST', body: JSON.stringify({ keys }) }),
};
