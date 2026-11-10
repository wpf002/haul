import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './lib/env';
import { MemoryStore } from './lib/store';

const base = {
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  SESSION_SECRET: randomBytes(48).toString('base64'),
  WEB_ORIGIN: 'http://localhost:3000',
};

const PLAIN_PAGE = `<html><body><main><h1>Weeknight Chili</h1><h2>Ingredients</h2>
<ul><li>1 lb ground beef</li><li>1 (28 oz) can crushed tomatoes</li><li>2 tsp chili powder</li></ul></main></body></html>`;

async function setup(opts: { demo: boolean; page?: string }) {
  const env = loadEnv({ ...base, NODE_ENV: 'test', DEMO_MODE: opts.demo ? 'true' : 'false' });
  const realFetch = globalThis.fetch;
  const app = await buildApp({ env, store: new MemoryStore(), instacart: null, extractor: null, urlGuard: async () => {} });
  const res = await app.inject({ method: 'GET', url: '/pantry' });
  const cookie = res.cookies.find((c) => c.name === 'haul_sid')!;
  const headers = { cookie: `haul_sid=${cookie.value}`, origin: env.WEB_ORIGIN };
  return { app, headers, realFetch };
}

describe('env', () => {
  it('refuses demo mode in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', DEMO_MODE: 'true' })).toThrow(/DEMO_MODE/);
  });
});

describe('demo mode', () => {
  it('runs import → basket → cart with no retailer keys', async () => {
    const { app, headers } = await setup({ demo: true });
    expect((await app.inject({ method: 'GET', url: '/config' })).json()).toMatchObject({ demo: true, instacart: true });
    expect((await app.inject({ method: 'GET', url: '/auth/kroger/status', headers })).json()).toEqual({ connected: true });
    const stores = (await app.inject({ method: 'GET', url: '/kroger/locations?zip=45202', headers })).json();
    expect(stores.length).toBeGreaterThan(0);

    const recipe = (await app.inject({ method: 'POST', url: '/recipes/import', headers, payload: { text: 'Ingredients\n- 1 lb ground beef\n- 1 large onion\n- 1 lb spaghetti' } })).json();
    const basket = (
      await app.inject({ method: 'POST', url: '/baskets', headers, payload: { recipes: [{ recipe }], retailer: 'kroger', locationId: stores[0].locationId } })
    ).json();
    expect(basket.lines.every((l: { pick: unknown }) => l.pick !== null)).toBe(true);

    const confirm = basket.lines.map((l: { need: { key: string }; pick: { upc: string }; packs: number }) => ({ key: l.need.key, upc: l.pick.upc, packs: l.packs }));
    const cart = await app.inject({ method: 'POST', url: `/baskets/${basket.draftId}/kroger`, headers, payload: { lines: confirm } });
    expect(cart.statusCode).toBe(200);
    expect(cart.json()).toMatchObject({ added: 3, demo: true });
  });

  it('reports a normal server as not demo', async () => {
    const { app } = await setup({ demo: false });
    expect((await app.inject({ method: 'GET', url: '/config' })).json()).toEqual({ demo: false, instacart: false, readsAnyPage: false });
  });
});

describe('url import fallback', () => {
  it('reads an ingredients heading when the page has no structured data', async () => {
    const { app, headers, realFetch } = await setup({ demo: true });
    globalThis.fetch = (async () => new Response(PLAIN_PAGE, { headers: { 'content-type': 'text/html' } })) as typeof fetch;
    try {
      const res = await app.inject({ method: 'POST', url: '/recipes/import', headers, payload: { url: 'https://example.com/chili' } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ source: 'text', title: 'Weeknight Chili' });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
