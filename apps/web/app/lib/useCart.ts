'use client';

import { BasketLine, ParsedRecipe, type RetailProduct } from '@haul/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { api, ApiError, type Config, Excluded, type Modality, type Pantry, type Retailer, Store } from './api';
import { priceOf } from './format';
import { readStored, STORE_KEY, writeStored } from './storage';

export const MAX_RECIPES = 5;
const DRAFT_KEY = 'haul.v1.draft';
const REVIEW_KEY = 'haul.v1.review';

const HaulRecipe = z.object({ id: z.string(), recipe: ParsedRecipe, servings: z.number().int().positive().nullable() });
export type HaulRecipe = z.infer<typeof HaulRecipe>;
const Draft = z.object({ recipes: z.array(HaulRecipe).max(MAX_RECIPES), have: z.array(z.string()), retailer: z.enum(['kroger', 'instacart']) });

const Row = z.object({ line: BasketLine, on: z.boolean(), choiceId: z.string().nullable(), packs: z.number().int().positive() });
export type Row = z.infer<typeof Row>;
const Review = z.object({ draftId: z.string(), retailer: z.enum(['kroger', 'instacart']), rows: z.array(Row), excluded: z.array(Excluded) });
export type Review = z.infer<typeof Review>;

export interface Sent {
  retailer: Retailer;
  count: number;
  url: string;
  demo: boolean;
}

export const optionsOf = (line: BasketLine): RetailProduct[] => (line.pick ? [line.pick, ...line.alternates] : line.alternates);
export const choiceOf = (row: Row): RetailProduct | null => optionsOf(row.line).find((p) => p.productId === row.choiceId) ?? null;
export const needsLook = (row: Row): boolean => row.line.confidence !== 'high';

function rowFor(line: BasketLine, retailer: Retailer): Row {
  // Ambiguous picks stay unchecked until the shopper confirms one.
  const on = retailer === 'instacart' || (line.pick !== null && line.confidence !== 'ambiguous');
  return { line, on, choiceId: line.pick?.productId ?? null, packs: line.packs };
}

export function lineTotal(row: Row): number {
  const price = priceOf(choiceOf(row));
  return row.on && price !== null ? price * row.packs : 0;
}

export function useCart() {
  const [config, setConfig] = useState<Config | null>(null);
  const [recipes, setRecipes] = useState<HaulRecipe[]>([]);
  const [have, setHave] = useState<Set<string>>(new Set());
  const [retailer, setRetailerState] = useState<Retailer>('kroger');
  const [pantry, setPantry] = useState<Pantry | null>(null);
  const [store, setStoreState] = useState<Store | null>(null);
  const [connected, setConnected] = useState(false);
  const [modality, setModality] = useState<Modality>('PICKUP');
  const [review, setReview] = useState<Review | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [busy, setBusy] = useState<'read' | 'build' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore the haul in progress and, after a Kroger sign-in, the review that was waiting on it.
  useEffect(() => {
    const draft = readStored('local', DRAFT_KEY, Draft);
    if (draft) {
      setRecipes(draft.recipes);
      setHave(new Set(draft.have));
      setRetailerState(draft.retailer);
    }
    setStoreState(readStored('local', STORE_KEY, Store));
    const params = new URLSearchParams(window.location.search);
    if (params.has('kroger')) {
      setReview(readStored('session', REVIEW_KEY, Review));
      writeStored('session', REVIEW_KEY, null);
      window.history.replaceState(null, '', window.location.pathname);
    }
    setHydrated(true);

    api.config().then(setConfig, reportLoadError);
    api.krogerStatus().then((s) => setConnected(s.connected), reportLoadError);
    api.pantry().then((p) => {
      setPantry(p);
      setModality(p.modality);
    }, reportLoadError);
  }, []);

  useEffect(() => {
    if (hydrated) writeStored('local', DRAFT_KEY, { recipes, have: [...have], retailer });
  }, [hydrated, recipes, have, retailer]);

  const run = useCallback(async (label: 'read' | 'build' | 'send', fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }, []);

  /** Any change to the inputs makes the current review stale. */
  const invalidate = () => {
    setReview(null);
    setSent(null);
  };

  const addRecipe = (source: string) =>
    run('read', async () => {
      const s = source.trim();
      const recipe = await api.importRecipe(/^https?:\/\//i.test(s) ? { url: s } : { text: s });
      setRecipes((rs) => [...rs, { id: crypto.randomUUID(), recipe, servings: recipe.servings }].slice(-MAX_RECIPES));
      invalidate();
    });

  const removeRecipe = (id: string) => {
    setRecipes((rs) => rs.filter((r) => r.id !== id));
    invalidate();
  };

  const setServings = (id: string, servings: number) => {
    setRecipes((rs) => rs.map((r) => (r.id === id ? { ...r, servings } : r)));
    invalidate();
  };

  const toggleHave = (name: string) => {
    setHave((h) => {
      const next = new Set(h);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    invalidate();
  };

  const setRetailer = (r: Retailer) => {
    setRetailerState(r);
    invalidate();
  };

  const setStore = (s: Store) => {
    setStoreState(s);
    writeStored('local', STORE_KEY, s);
    invalidate();
    if (pantry) {
      const next = { ...pantry, krogerLocationId: s.locationId };
      setPantry(next);
      api.savePantry(next).catch(reportLoadError);
    }
  };

  const locationId = store?.locationId ?? pantry?.krogerLocationId ?? null;

  const build = () =>
    run('build', async () => {
      const titles = recipes.map((r) => r.recipe.title).filter((t): t is string => !!t);
      const res = await api.buildBasket({
        title: titles.join(' + ').slice(0, 120) || 'Haul',
        recipes: recipes.map((r) => ({ recipe: r.recipe, servings: r.servings ?? undefined })),
        have: [...have],
        retailer,
        locationId: retailer === 'kroger' ? (locationId ?? undefined) : undefined,
      });
      setReview({ draftId: res.draftId, retailer, excluded: res.excluded, rows: res.lines.map((l) => rowFor(l, retailer)) });
      setSent(null);
    });

  const updateRow = (key: string, patch: (r: Row) => Partial<Row>) =>
    setReview((rv) => (rv ? { ...rv, rows: rv.rows.map((r) => (r.line.need.key === key ? { ...r, ...patch(r) } : r)) } : rv));

  const toggleRow = (key: string) => updateRow(key, (r) => ({ on: !r.on }));
  const setPacks = (key: string, packs: number) => updateRow(key, () => ({ packs }));
  const choose = (key: string, productId: string) =>
    updateRow(key, (r) => ({ choiceId: productId, packs: r.line.optionPacks[productId] ?? r.packs, on: true }));

  const selected = useMemo(
    () => (review?.rows ?? []).filter((r) => r.on && (review?.retailer === 'instacart' || choiceOf(r)?.upc)),
    [review],
  );
  const total = useMemo(() => (review?.rows ?? []).reduce((s, r) => s + lineTotal(r), 0), [review]);
  const servings = recipes.reduce((s, r) => s + (r.servings ?? 0), 0);

  const connectKroger = () => {
    if (review) writeStored('session', REVIEW_KEY, review);
    window.location.href = api.krogerConnectUrl('/');
  };

  const send = () =>
    run('send', async () => {
      if (!review) return;
      try {
        if (review.retailer === 'instacart') {
          const res = await api.sendToInstacart(review.draftId, selected.map((r) => r.line.need.key));
          setSent({ retailer: 'instacart', count: selected.length, url: res.url, demo: res.demo ?? false });
        } else {
          const lines = selected.map((r) => ({ key: r.line.need.key, upc: choiceOf(r)!.upc!, packs: r.packs }));
          const res = await api.addToKroger(review.draftId, lines, modality);
          setSent({ retailer: 'kroger', count: res.added, url: res.checkoutUrl, demo: res.demo ?? false });
        }
        setReview(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setConnected(false);
          throw new Error('Kroger sign-in expired. Connect again.');
        }
        throw e;
      }
    });

  const startOver = () => {
    setRecipes([]);
    setHave(new Set());
    invalidate();
  };

  return {
    config, recipes, have, retailer, store, locationId, connected, modality, review, sent, busy, error, hydrated,
    selected, total, servings,
    addRecipe, removeRecipe, setServings, toggleHave, setRetailer, setStore, setModality, build,
    toggleRow, setPacks, choose, connectKroger, send, startOver, back: invalidate,
  };
}

export type Cart = ReturnType<typeof useCart>;

function reportLoadError(e: unknown) {
  console.warn('haul: background request failed', e);
}
