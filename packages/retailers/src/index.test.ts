import { describe, expect, it, vi } from 'vitest';
import { createPkce, InstacartClient, KrogerClient, mapKrogerProduct } from './index';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('kroger', () => {
  it('maps a product response', () => {
    const p = mapKrogerProduct({
      productId: '0001111060933',
      upc: '0001111060933',
      description: 'Kroger Crushed Tomatoes',
      brand: 'Kroger',
      images: [{ perspective: 'front', sizes: [{ size: 'medium', url: 'https://img/x.jpg' }] }],
      items: [{ size: '28 oz', price: { regular: 1.79, promo: 0 }, inventory: { stockLevel: 'HIGH' } }],
    });
    expect(p).toMatchObject({ priceCents: 179, promoPriceCents: null, inStock: true, sizeText: '28 oz', imageUrl: 'https://img/x.jpg' });
  });

  it('builds a PKCE authorize URL with cart scope', () => {
    const k = new KrogerClient({ clientId: 'id', clientSecret: 's', redirectUri: 'http://localhost:4000/cb' });
    const { state, challenge, verifier } = createPkce();
    const u = new URL(k.authorizeUrl(state, challenge));
    expect(u.searchParams.get('scope')).toContain('cart.basic:write');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.toString()).not.toContain(verifier);
  });

  it('caches the app token and sends PUT /cart/add', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const f = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/token')) return json({ access_token: 'app', expires_in: 1800, token_type: 'bearer' });
      if (String(url).includes('/products')) return json({ data: [] });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const k = new KrogerClient({ clientId: 'id', clientSecret: 's', redirectUri: 'x', fetch: f });
    await k.search('crushed tomatoes', { locationId: '01400943' });
    await k.search('kidney beans', { locationId: '01400943' });
    expect(calls.filter((c) => c.url.endsWith('/token'))).toHaveLength(1);
    await k.addToCart('user-token', [{ upc: '0001111060933', quantity: 2 }], 'PICKUP');
    const put = calls.find((c) => c.url.endsWith('/cart/add'))!;
    expect(put.init?.method).toBe('PUT');
    expect(JSON.parse(String(put.init?.body))).toEqual({ items: [{ upc: '0001111060933', quantity: 2, modality: 'PICKUP' }] });
  });
});

describe('instacart', () => {
  it('posts a shopping list and returns the link', async () => {
    let sent: any;
    const f = (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return json({ products_link_url: 'https://www.instacart.com/store/shopping_lists/123' });
    }) as unknown as typeof fetch;
    const ic = new InstacartClient({ apiKey: 'k', apiBase: 'https://connect.dev.instacart.tools', fetch: f });
    const { url } = await ic.createList({
      title: 'Chili',
      needs: [{ key: 'ground beef', name: 'ground beef', amount: 907.18, dimension: 'mass', sources: [], flags: [] }],
    });
    expect(url).toContain('instacart.com');
    expect(sent.line_items[0].line_item_measurements[0]).toEqual({ quantity: 2, unit: 'pound' });
  });
});
