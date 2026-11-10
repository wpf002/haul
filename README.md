# Haul

Paste a recipe. Haul works out what you actually need to buy, finds it at your store, and fills your cart. You check out.

- **Kroger** (and its banners: Ralphs, King Soopers, Fry's, Harris Teeter, Fred Meyer, etc.): real products, real prices, written straight to your Kroger cart through Kroger's public Cart API.
- **Instacart**: a shopping list page through the Instacart Developer Platform. The shopper picks any participating store and adds to their own cart.
- **Amazon, Target, Shipt**: not supported. No approved cart API, and browser automation breaks their terms and puts accounts at risk.

Haul never checks out, never touches payment, and never adds anything the shopper didn't see and confirm.

## How It Works

```
recipe URL / pasted text
  └─ recipe-parser   JSON-LD → microdata → text. Quantity, unit, name, notes, optional, sections.
      └─ resolver/needs   pantry staples, "I have this", optional garnish, scaling, merge across recipes
          └─ retailers    Kroger product search at the chosen store
              └─ resolver/score   deterministic ranking: name match, identity-shift penalty,
                                  pack math, stock, preferences, price as tie-breaker
                  └─ (optional) LLM rerank of the top 8, never does math, can't add products
                      └─ review screen → user confirms → PUT /cart/add → redirect to Kroger checkout
```

Three layers stay separate the whole way: what the recipe said, what to buy, and the exact product.

## Repo

```
apps/api            Fastify API: import, baskets, Kroger OAuth (PKCE), cart write, Instacart handoff
apps/web            Next.js review UI
packages/core       shared zod schemas and types
packages/units      unit table, fractions, retail size parsing, pack planning (pure, tested)
packages/recipe-parser   page + text parsing, SSRF-guarded fetch
packages/retailers  Kroger client, Instacart client, fixture + recording catalogs
packages/resolver   needs builder, scorer, reranker, basket resolution
packages/db         Prisma schema (Postgres)
eval/               labeled recipes + the accuracy harness
scripts/bootstrap.sh     infra bootstrap
```

## Setup

```bash
corepack enable
./scripts/bootstrap.sh .          # folders, configs, .env, pnpm install (safe to re-run)
docker compose up -d db           # local Postgres
# fill .env: TOKEN_ENCRYPTION_KEY, SESSION_SECRET, KROGER_*, INSTACART_API_KEY
pnpm db:generate && pnpm db:migrate
pnpm dev                          # api :4000, web :3000
```

Kroger app: register at developer.kroger.com, enable Product and Cart, set the redirect URI to `KROGER_REDIRECT_URI`.
Instacart: create a development key in the Instacart Developer Platform dashboard.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm eval                 # offline, sample catalog
pnpm eval -- --live       # real Kroger search, responses cached in eval/runs/ (gitignored)
pnpm eval -- --live --rerank
```

The eval is the gate. Target is 85% of lines acceptable without edits on 50 real recipes at a real store. Add a recipe to `eval/recipes/`, label it in `eval/labels/` (copy `_template.json`).

## Rules This Code Enforces

- Cart writes only accept UPCs that were on that user's review screen for that line.
- Draft baskets (which hold retailer product data) are deleted right after the cart write, and swept after 24h.
- No purchase or cart history is stored. Only user-entered pantry preferences and a count-only consent log.
- OAuth tokens are AES-256-GCM encrypted with the user id as associated data. PKCE on the Kroger flow; state is single-use and bound to the session.
- Recipe fetches block private, loopback, link-local and CGNAT addresses, re-check every redirect, and cap size and time.
- Allergen, infant and alcohol lines are always marked for review.

## Deploy (Railway)

Two services from this repo plus a Postgres plugin.

- **api**: build `pnpm install && pnpm db:generate && pnpm --filter @haul/api build`, start `pnpm --filter @haul/db exec prisma migrate deploy && pnpm --filter @haul/api start`
- **web**: build `pnpm install && pnpm --filter @haul/web build`, start `pnpm --filter @haul/web start`, set `NEXT_PUBLIC_API_URL`

Set `NODE_ENV=production` (turns on secure cookies), and point `WEB_ORIGIN`, `API_PUBLIC_URL`, `KROGER_REDIRECT_URI` at the real domains. Put web and api on the same parent domain so the session cookie stays first-party.

## Status

| Piece | State |
|---|---|
| Parser, units, needs, scorer | Built, tested |
| Kroger OAuth, search, cart | Built, tested against mocked responses. Needs a live run with your developer app |
| Instacart handoff | Built, tested against mocked responses. Needs a dev key |
| Review UI | Built, single page |
| Pantry settings UI | API done, screen not built |
| LLM fallback for pages with no structured recipe | Not built. Returns 422 and asks for pasted text |
| Eval set | 1 labeled recipe. Needs 50 |
