import { randomBytes } from 'node:crypto';
import { SAMPLE_CATALOG } from '@haul/resolver/fixtures';
import { FixtureCatalog, KrogerClient } from '@haul/retailers';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { TokenBox } from './lib/crypto';
import { loadEnv } from './lib/env';
import { MemoryStore } from './lib/store';

const env = loadEnv({
  NODE_ENV: 'test',
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  SESSION_SECRET: randomBytes(48).toString('base64'),
  WEB_ORIGIN: 'http://localhost:3000',
});

const CHILI = `Ingredients
- 1 lb ground beef
- 1 (28 oz) can crushed tomatoes
- 2 (15-ounce) cans kidney beans
- 1 tsp kosher salt`;

let cartCalls: unknown[] = [];
const fakeKroger = new KrogerClient({
  clientId: 'id',
  clientSecret: 'secret',
  redirectUri: 'http://localhost:4000/auth/kroger/callback',
  fetch: (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/token')) return new Response(JSON.stringify({ access_token: 'user-at', refresh_token: 'rt', expires_in: 1800, token_type: 'bearer' }));
    if (u.endsWith('/cart/add')) {
      cartCalls.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch,
});

async function setup() {
  const store = new MemoryStore();
  const app = await buildApp({ env, store, kroger: fakeKroger, catalog: new FixtureCatalog(SAMPLE_CATALOG), instacart: null, urlGuard: async () => {} });
  // first request mints the session cookie
  const res = await app.inject({ method: 'GET', url: '/pantry' });
  const cookie = res.cookies.find((c) => c.name === 'haul_sid')!;
  const headers = { cookie: `haul_sid=${cookie.value}`, origin: env.WEB_ORIGIN };
  return { app, store, headers };
}

afterEach(() => {
  cartCalls = [];
});

describe('api', () => {
  it('imports pasted text, builds a basket, and adds only confirmed items', async () => {
    const { app, store, headers } = await setup();

    const recipe = (await app.inject({ method: 'POST', url: '/recipes/import', headers, payload: { text: CHILI } })).json();
    expect(recipe.ingredients).toHaveLength(4);

    const basket = await app.inject({ method: 'POST', url: '/baskets', headers, payload: { recipes: [{ recipe }], retailer: 'kroger', locationId: '01400943' } });
    expect(basket.statusCode).toBe(200);
    const { draftId, lines, excluded } = basket.json();
    expect(excluded.map((e: { key: string }) => e.key)).toContain('salt');
    expect(lines).toHaveLength(3);

    // Not linked yet
    const confirm = lines.map((l: any) => ({ key: l.need.key, upc: l.pick.upc, packs: l.packs }));
    const noAuth = await app.inject({ method: 'POST', url: `/baskets/${draftId}/kroger`, headers, payload: { lines: confirm } });
    expect(noAuth.statusCode).toBe(401);

    // Link Kroger via the real start/callback flow
    const start = await app.inject({ method: 'GET', url: '/auth/kroger/start?returnTo=/review', headers });
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const cb = await app.inject({ method: 'GET', url: `/auth/kroger/callback?code=abc&state=${state}`, headers });
    expect(cb.headers.location).toBe('http://localhost:3000/review?kroger=connected');
    // tokens are encrypted at rest
    const [link] = [...store.links.values()];
    expect(link!.accessTokenEnc).not.toContain('user-at');

    // A UPC that wasn't on the review screen is refused
    const sneaky = await app.inject({ method: 'POST', url: `/baskets/${draftId}/kroger`, headers, payload: { lines: [{ key: 'ground beef', upc: '9999999999999', packs: 1 }] } });
    expect(sneaky.statusCode).toBe(400);

    const ok = await app.inject({ method: 'POST', url: `/baskets/${draftId}/kroger`, headers, payload: { lines: confirm, modality: 'PICKUP' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().added).toBe(3);
    expect(cartCalls).toHaveLength(1);
    // draft (retailer product data) is gone after the write
    expect(store.drafts.size).toBe(0);
    expect(store.events).toEqual([{ userId: expect.any(String), retailer: 'kroger', lineCount: 3 }]);
  });

  it('rejects cross-origin writes', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({ method: 'POST', url: '/recipes/import', headers: { ...headers, origin: 'https://evil.example' }, payload: { text: CHILI } });
    expect(res.statusCode).toBe(403);
  });

  it('refuses a callback whose state belongs to someone else', async () => {
    const a = await setup();
    const start = await a.app.inject({ method: 'GET', url: '/auth/kroger/start', headers: a.headers });
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    // different browser, same app
    const other = await a.app.inject({ method: 'GET', url: '/pantry' });
    const otherCookie = other.cookies.find((c) => c.name === 'haul_sid')!;
    const cb = await a.app.inject({ method: 'GET', url: `/auth/kroger/callback?code=x&state=${state}`, headers: { cookie: `haul_sid=${otherCookie.value}` } });
    expect(cb.statusCode).toBe(400);
  });

  it('blocks open redirects on returnTo', async () => {
    const { app, store, headers } = await setup();
    await app.inject({ method: 'GET', url: '/auth/kroger/start?returnTo=//evil.example', headers });
    const [s] = [...store.states.values()];
    expect(s!.returnTo).toBe('/');
  });

  it('round-trips the token box', () => {
    const box = new TokenBox(env.TOKEN_ENCRYPTION_KEY);
    const sealed = box.seal('secret', 'u:kroger');
    expect(box.open(sealed, 'u:kroger')).toBe('secret');
    expect(() => box.open(sealed, 'other:kroger')).toThrow();
  });
});
