import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { DEFAULT_PANTRY, ParsedRecipe } from '@haul/core';
import { ClaudeRecipeExtractor, extractFromPageText, fetchRecipe, parseRecipeText, type RecipeExtractor } from '@haul/recipe-parser';
import { DEMO_CATALOG, DEMO_STORES } from '@haul/resolver/demo';
import { AnthropicReranker, buildNeeds, resolveBasket, unresolvedLine } from '@haul/resolver';
import { type CatalogAdapter, createPkce, FixtureCatalog, InstacartClient, KrogerClient, RetailerError } from '@haul/retailers';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { TokenBox } from './lib/crypto';
import type { Env } from './lib/env';
import { requireUser } from './lib/session';
import { assertPublicUrl } from './lib/ssrf';
import type { PantryRow, Store } from './lib/store';

export interface AppDeps {
  env: Env;
  store: Store;
  kroger?: KrogerClient;
  instacart?: InstacartClient | null;
  /** Tests and evals swap in a fixture catalog. */
  catalog?: CatalogAdapter;
  /** Skip DNS in tests. */
  urlGuard?: (u: URL) => Promise<unknown>;
  /** LLM recipe reader for unstructured pages. null disables it. */
  extractor?: RecipeExtractor | null;
}

const DRAFT_TTL_MS = 24 * 3600 * 1000;
const MAX_RECIPES = 5;
const MAX_NEEDS = 80;
const DEMO_TOKEN = 'demo';
const INSTACART_HOME = 'https://www.instacart.com/';

const ImportBody = z.union([
  z.object({ url: z.string().url().max(2048) }),
  z.object({ text: z.string().min(3).max(20_000) }),
]);

const BasketBody = z.object({
  title: z.string().max(120).default('Haul list'),
  recipes: z.array(z.object({ recipe: ParsedRecipe, servings: z.number().int().min(1).max(50).optional() })).min(1).max(MAX_RECIPES),
  have: z.array(z.string().max(80)).max(100).default([]),
  includeOptional: z.boolean().default(false),
  retailer: z.enum(['kroger', 'instacart']),
  locationId: z.string().regex(/^[0-9A-Za-z]{6,12}$/).optional(),
});

const KrogerConfirmBody = z.object({
  modality: z.enum(['PICKUP', 'DELIVERY']).default('PICKUP'),
  lines: z
    .array(z.object({ key: z.string(), upc: z.string().regex(/^\d{8,14}$/), packs: z.number().int().min(1).max(12) }))
    .min(1)
    .max(MAX_NEEDS),
});

const PantryBody = z.object({
  staples: z.array(z.string().min(1).max(60)).max(200),
  dislikes: z.array(z.string().min(1).max(60)).max(200),
  preferStoreBrand: z.boolean(),
  preferOrganic: z.boolean(),
  brandPrefs: z.record(z.string().max(60), z.string().max(60)),
  krogerLocationId: z.string().regex(/^[0-9A-Za-z]{6,12}$/).nullable(),
  modality: z.enum(['PICKUP', 'DELIVERY']),
});

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { env, store } = deps;
  const prod = env.NODE_ENV === 'production';
  const box = new TokenBox(env.TOKEN_ENCRYPTION_KEY);
  const kroger =
    deps.kroger ??
    new KrogerClient({ clientId: env.KROGER_CLIENT_ID, clientSecret: env.KROGER_CLIENT_SECRET, redirectUri: env.KROGER_REDIRECT_URI, apiBase: env.KROGER_API_BASE });
  const demo = env.DEMO_MODE;
  const catalog = deps.catalog ?? (demo ? new FixtureCatalog(DEMO_CATALOG) : kroger);
  const instacart =
    deps.instacart !== undefined
      ? deps.instacart
      : env.INSTACART_API_KEY
        ? new InstacartClient({ apiKey: env.INSTACART_API_KEY, apiBase: env.INSTACART_API_BASE, linkbackUrl: env.INSTACART_LINKBACK_URL })
        : null;
  const reranker = env.ANTHROPIC_API_KEY ? new AnthropicReranker(env.ANTHROPIC_API_KEY, env.RERANK_MODEL) : null;
  const extractor =
    deps.extractor !== undefined ? deps.extractor : env.ANTHROPIC_API_KEY ? new ClaudeRecipeExtractor(env.ANTHROPIC_API_KEY, env.EXTRACT_MODEL) : null;
  const urlGuard = deps.urlGuard ?? ((u: URL) => assertPublicUrl(u.toString()));

  const app = Fastify({
    logger: { level: prod ? 'info' : 'debug', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    bodyLimit: 256 * 1024,
    trustProxy: prod,
  });
  await app.register(helmet);
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });

  // CSRF: browsers send Origin on cross-site POST/PUT/DELETE. Reject anything not ours.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    const origin = req.headers.origin;
    if (origin && origin !== env.WEB_ORIGIN) return reply.code(403).send({ error: 'bad origin' });
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'invalid request', issues: err.issues.map((i) => i.path.join('.')) });
    if (err instanceof RetailerError) {
      req.log.warn({ retailer: err.retailer, status: err.status }, 'retailer error');
      return reply.code(502).send({ error: `${err.retailer} is having trouble right now` });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'something went wrong' : (err as Error).message });
  });

  const user = (req: FastifyRequest, reply: FastifyReply) => requireUser(req, reply, store, prod);
  const pantryOf = async (userId: string): Promise<PantryRow> =>
    (await store.getPantry(userId)) ?? { ...DEFAULT_PANTRY, krogerLocationId: null, modality: 'PICKUP' };

  async function krogerAccessToken(userId: string): Promise<string | null> {
    if (demo) return DEMO_TOKEN;
    const link = await store.getLink(userId, 'kroger');
    if (!link) return null;
    const aad = `${userId}:kroger`;
    if (link.expiresAt.getTime() > Date.now() + 60_000) return box.open(link.accessTokenEnc, aad);
    if (!link.refreshTokenEnc) return null;
    try {
      const t = await kroger.refresh(box.open(link.refreshTokenEnc, aad));
      await store.putLink(userId, 'kroger', {
        accessTokenEnc: box.seal(t.accessToken, aad),
        refreshTokenEnc: t.refreshToken ? box.seal(t.refreshToken, aad) : null,
        expiresAt: new Date(t.expiresAt),
      });
      return t.accessToken;
    } catch {
      await store.deleteLink(userId, 'kroger');
      return null;
    }
  }

  // ---------- routes ----------

  app.get('/health', async () => ({ ok: true }));

  // What this server can do, so the web app only offers working paths.
  app.get('/config', async () => ({ demo, instacart: instacart !== null || demo, readsAnyPage: extractor !== null }));

  app.post('/recipes/import', async (req, reply) => {
    await user(req, reply);
    const body = ImportBody.parse(req.body);
    if ('text' in body) return parseRecipeText(body.text);
    let result;
    try {
      result = await fetchRecipe(body.url, { guard: urlGuard });
    } catch (e) {
      return reply.code(422).send({ error: `Couldn't load that page: ${(e as Error).message}` });
    }
    // Structured data first, then an "Ingredients" heading in the page text, then the LLM.
    const recipe =
      (result.recipe?.ingredients.length ? result.recipe : null) ??
      extractFromPageText(result.html, body.url) ??
      (extractor ? await extractor.extract(result.html, body.url) : null);
    if (!recipe) return reply.code(422).send({ error: 'No recipe found on that page. Paste the ingredient list instead.' });
    return recipe;
  });

  app.post('/baskets', async (req, reply) => {
    const userId = await user(req, reply);
    const body = BasketBody.parse(req.body);
    const pantry = await pantryOf(userId);
    const { needs, excluded } = buildNeeds(body.recipes, pantry, { have: body.have, includeOptional: body.includeOptional });
    if (needs.length > MAX_NEEDS) return reply.code(400).send({ error: `Too many items (${needs.length}). Split into smaller lists.` });

    let lines;
    let locationId: string | null = null;
    if (body.retailer === 'kroger') {
      locationId = body.locationId ?? pantry.krogerLocationId;
      if (!locationId) return reply.code(400).send({ error: 'Pick a Kroger store first.' });
      lines = await resolveBasket(needs, catalog, { locationId, pantry, reranker });
    } else {
      lines = needs.map((need) => unresolvedLine(need, 'Instacart picks the product'));
    }
    const draftId = await store.createDraft({
      userId,
      retailer: body.retailer,
      locationId,
      title: body.title,
      lines,
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    });
    return { draftId, lines, excluded };
  });

  app.post('/baskets/:id/kroger', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const userId = await user(req, reply);
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const body = KrogerConfirmBody.parse(req.body);
    const draft = await store.getDraft(id, userId);
    if (!draft || draft.retailer !== 'kroger') return reply.code(404).send({ error: 'That list expired. Build it again.' });

    // Consent check: only UPCs we actually showed for that line can go in the cart.
    const shown = new Map(draft.lines.map((l) => [l.need.key, new Set([l.pick, ...l.alternates].filter(Boolean).map((p) => p!.upc))]));
    for (const l of body.lines) {
      if (!shown.get(l.key)?.has(l.upc)) return reply.code(400).send({ error: `"${l.key}" wasn't on the review screen` });
    }

    const token = await krogerAccessToken(userId);
    if (!token) return reply.code(401).send({ error: 'Connect your Kroger account first.', authUrl: '/auth/kroger/start' });

    if (!demo) await kroger.addToCart(token, body.lines.map((l) => ({ upc: l.upc, quantity: l.packs })), body.modality);
    await store.deleteDraft(id);
    await store.logCartEvent(userId, 'kroger', body.lines.length);
    return { added: body.lines.length, checkoutUrl: kroger.checkoutUrl(), demo };
  });

  app.post('/baskets/:id/instacart', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const userId = await user(req, reply);
    if (!instacart && !demo) return reply.code(503).send({ error: 'Instacart is not configured' });
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const { keys } = z.object({ keys: z.array(z.string()).min(1).max(MAX_NEEDS) }).parse(req.body);
    const draft = await store.getDraft(id, userId);
    if (!draft) return reply.code(404).send({ error: 'That list expired. Build it again.' });
    const wanted = new Set(keys);
    const needs = draft.lines.map((l) => l.need).filter((n) => wanted.has(n.key));
    if (needs.length === 0) return reply.code(400).send({ error: 'Nothing selected' });
    const { url } = instacart ? await instacart.createList({ title: draft.title, needs }) : { url: INSTACART_HOME };
    await store.deleteDraft(id);
    await store.logCartEvent(userId, 'instacart', needs.length);
    return { url, demo: instacart === null };
  });

  // ---------- Kroger account link ----------

  app.get('/auth/kroger/start', async (req, reply) => {
    const userId = await user(req, reply);
    const { returnTo } = z.object({ returnTo: z.string().max(200).optional() }).parse(req.query);
    // Open-redirect guard: only same-site relative paths.
    const safeReturn = returnTo && /^\/[A-Za-z0-9/_\-?=&]*$/.test(returnTo) && !returnTo.startsWith('//') ? returnTo : '/';
    const { verifier, challenge, state } = createPkce();
    await store.saveOAuthState({ state, userId, verifierEnc: box.seal(verifier, state), returnTo: safeReturn, expiresAt: new Date(Date.now() + 10 * 60_000) });
    return reply.redirect(kroger.authorizeUrl(state, challenge));
  });

  app.get('/auth/kroger/callback', async (req, reply) => {
    const userId = await user(req, reply);
    const q = z.object({ code: z.string().max(2048).optional(), state: z.string().max(128), error: z.string().optional() }).parse(req.query);
    const saved = await store.takeOAuthState(q.state);
    // State must exist, be fresh, and belong to this browser's user.
    if (!saved || saved.userId !== userId || saved.expiresAt < new Date()) return reply.code(400).send({ error: 'Login expired. Try again.' });
    if (q.error || !q.code) return reply.redirect(`${env.WEB_ORIGIN}${saved.returnTo ?? '/'}?kroger=denied`);
    const t = await kroger.exchangeCode(q.code, box.open(saved.verifierEnc, q.state));
    const aad = `${userId}:kroger`;
    await store.putLink(userId, 'kroger', {
      accessTokenEnc: box.seal(t.accessToken, aad),
      refreshTokenEnc: t.refreshToken ? box.seal(t.refreshToken, aad) : null,
      expiresAt: new Date(t.expiresAt),
    });
    return reply.redirect(`${env.WEB_ORIGIN}${saved.returnTo ?? '/'}?kroger=connected`);
  });

  app.get('/auth/kroger/status', async (req, reply) => {
    const userId = await user(req, reply);
    return { connected: demo || (await store.getLink(userId, 'kroger')) !== null };
  });

  app.delete('/auth/kroger', async (req, reply) => {
    const userId = await user(req, reply);
    await store.deleteLink(userId, 'kroger');
    return { connected: false };
  });

  app.get('/kroger/locations', async (req, reply) => {
    await user(req, reply);
    const { zip } = z.object({ zip: z.string().regex(/^\d{5}$/) }).parse(req.query);
    return demo ? DEMO_STORES : kroger.locations(zip);
  });

  // ---------- pantry ----------

  app.get('/pantry', async (req, reply) => pantryOf(await user(req, reply)));
  app.put('/pantry', async (req, reply) => {
    const userId = await user(req, reply);
    const body = PantryBody.parse(req.body);
    await store.putPantry(userId, body);
    return body;
  });

  // Retailer data is temporary by rule. Sweep expired drafts and OAuth state.
  const sweep = setInterval(() => void store.sweepDrafts(new Date()).catch(() => undefined), 15 * 60_000);
  sweep.unref();
  app.addHook('onClose', async () => clearInterval(sweep));

  return app;
}
