import { createHash, randomBytes } from 'node:crypto';
import type { RetailProduct, StockLevel } from '@haul/core';
import { z } from 'zod';
import { type CartAdapter, type CartLine, type CatalogAdapter, RetailerError, type SearchOptions } from './types';

export interface KrogerConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiBase?: string;
  fetch?: typeof fetch;
}

export const KROGER_USER_SCOPES = ['cart.basic:write', 'profile.compact', 'product.compact'] as const;

const TokenResponse = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  token_type: z.string(),
});
export type KrogerTokens = { accessToken: string; refreshToken: string | null; expiresAt: number };

const KrogerProduct = z.object({
  productId: z.string(),
  upc: z.string().optional(),
  description: z.string(),
  brand: z.string().optional(),
  categories: z.array(z.string()).optional(),
  images: z
    .array(
      z.object({
        perspective: z.string().optional(),
        sizes: z.array(z.object({ size: z.string(), url: z.string() })).optional(),
      }),
    )
    .optional(),
  items: z
    .array(
      z.object({
        size: z.string().optional(),
        price: z.object({ regular: z.number().optional(), promo: z.number().optional() }).optional(),
        inventory: z.object({ stockLevel: z.string().optional() }).optional(),
      }),
    )
    .optional(),
});
const ProductsResponse = z.object({ data: z.array(KrogerProduct) });

const Location = z.object({
  locationId: z.string(),
  name: z.string(),
  chain: z.string().optional(),
  address: z
    .object({ addressLine1: z.string().optional(), city: z.string().optional(), state: z.string().optional(), zipCode: z.string().optional() })
    .optional(),
});
const LocationsResponse = z.object({ data: z.array(Location) });
export type KrogerLocation = z.infer<typeof Location>;

const KROGER_STOCK: Record<string, StockLevel> = { HIGH: 'in', LOW: 'low', TEMPORARILY_OUT_OF_STOCK: 'out' };

const toCents = (n: number | undefined) => (typeof n === 'number' && n > 0 ? Math.round(n * 100) : null);

export function mapKrogerProduct(p: z.infer<typeof KrogerProduct>): RetailProduct {
  const item = p.items?.[0];
  const front = p.images?.find((i) => i.perspective === 'front') ?? p.images?.[0];
  const img = front?.sizes?.find((s) => s.size === 'medium') ?? front?.sizes?.[0];
  const stock = item?.inventory?.stockLevel;
  return {
    retailer: 'kroger',
    productId: p.productId,
    upc: p.upc ?? p.productId,
    description: p.description,
    brand: p.brand ?? null,
    sizeText: item?.size ?? null,
    priceCents: toCents(item?.price?.regular),
    promoPriceCents: toCents(item?.price?.promo),
    stock: stock ? (KROGER_STOCK[stock] ?? null) : null,
    categories: p.categories ?? [],
    imageUrl: img?.url ?? null,
  };
}

/** PKCE pair. Store the verifier server-side keyed by `state`, never in the URL. */
export function createPkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, state: randomBytes(16).toString('base64url') };
}

export class KrogerClient implements CatalogAdapter, CartAdapter {
  readonly id = 'kroger' as const;
  private readonly base: string;
  private readonly f: typeof fetch;
  private appToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly cfg: KrogerConfig) {
    this.base = (cfg.apiBase ?? 'https://api.kroger.com/v1').replace(/\/$/, '');
    this.f = cfg.fetch ?? fetch;
  }

  // ---------- OAuth ----------

  authorizeUrl(state: string, codeChallenge: string): string {
    const u = new URL(`${this.base}/connect/oauth2/authorize`);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', this.cfg.clientId);
    u.searchParams.set('redirect_uri', this.cfg.redirectUri);
    u.searchParams.set('scope', KROGER_USER_SCOPES.join(' '));
    u.searchParams.set('state', state);
    u.searchParams.set('code_challenge', codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
    return u.toString();
  }

  private basicAuth(): string {
    return `Basic ${Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64')}`;
  }

  private async token(body: URLSearchParams): Promise<z.infer<typeof TokenResponse>> {
    const res = await this.f(`${this.base}/connect/oauth2/token`, {
      method: 'POST',
      headers: { authorization: this.basicAuth(), 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new RetailerError('kroger', res.status, `token request failed`);
    return TokenResponse.parse(await res.json());
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<KrogerTokens> {
    const t = await this.token(
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.cfg.redirectUri, code_verifier: codeVerifier }),
    );
    return { accessToken: t.access_token, refreshToken: t.refresh_token ?? null, expiresAt: Date.now() + t.expires_in * 1000 };
  }

  async refresh(refreshToken: string): Promise<KrogerTokens> {
    const t = await this.token(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }));
    return { accessToken: t.access_token, refreshToken: t.refresh_token ?? refreshToken, expiresAt: Date.now() + t.expires_in * 1000 };
  }

  /** Client-credentials token for catalog/location reads. Cached until 60s before expiry. */
  private async appAccessToken(): Promise<string> {
    if (this.appToken && this.appToken.expiresAt > Date.now() + 60_000) return this.appToken.value;
    const t = await this.token(new URLSearchParams({ grant_type: 'client_credentials', scope: 'product.compact' }));
    this.appToken = { value: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
    return t.access_token;
  }

  private async get<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
    const u = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const res = await this.f(u, { headers: { authorization: `Bearer ${await this.appAccessToken()}`, accept: 'application/json' } });
    if (!res.ok) throw new RetailerError('kroger', res.status, `GET ${path} failed`);
    return schema.parse(await res.json());
  }

  // ---------- Catalog ----------

  async search(term: string, opts: SearchOptions): Promise<RetailProduct[]> {
    // Kroger rejects terms over 8 words; trim and drop punctuation.
    const cleaned = term.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 8).join(' ');
    if (cleaned.length < 3) return [];
    const res = await this.get(
      '/products',
      { 'filter.term': cleaned, 'filter.locationId': opts.locationId, 'filter.limit': String(Math.min(opts.limit ?? 12, 50)) },
      ProductsResponse,
    );
    return res.data.map(mapKrogerProduct);
  }

  async locations(zipCode: string, limit = 5): Promise<KrogerLocation[]> {
    if (!/^\d{5}$/.test(zipCode)) throw new RetailerError('kroger', 400, 'zip must be 5 digits');
    const res = await this.get('/locations', { 'filter.zipCode.near': zipCode, 'filter.limit': String(limit) }, LocationsResponse);
    return res.data;
  }

  // ---------- Cart ----------

  async addToCart(accessToken: string, lines: CartLine[], modality: 'PICKUP' | 'DELIVERY'): Promise<void> {
    if (lines.length === 0) return;
    const res = await this.f(`${this.base}/cart/add`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ items: lines.map((l) => ({ upc: l.upc, quantity: l.quantity, modality })) }),
    });
    if (!res.ok) throw new RetailerError('kroger', res.status, 'cart add failed');
  }

  checkoutUrl(): string {
    return 'https://www.kroger.com/cart';
  }
}
