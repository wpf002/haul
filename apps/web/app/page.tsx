'use client';

import type { BasketLine, ParsedRecipe, RetailProduct } from '@haul/core';
import { useEffect, useMemo, useState } from 'react';
import { API, api, type Excluded, type Store } from './api';

type Retailer = 'kroger' | 'instacart';
type Row = { line: BasketLine; on: boolean; choice: RetailProduct | null; packs: number };

const unitCents = (p: RetailProduct | null) => (p ? (p.promoPriceCents ?? p.priceCents) : null);
const money = (cents: number | null | undefined) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`);
const REASON: Record<Excluded['reason'], string> = { pantry: 'In Your Pantry', have: 'You Have It', optional: 'Optional', dislike: 'Skipped' };

export default function Home() {
  const [source, setSource] = useState('');
  const [servings, setServings] = useState<number | ''>('');
  const [recipe, setRecipe] = useState<ParsedRecipe | null>(null);
  const [have, setHave] = useState<Set<string>>(new Set());
  const [retailer, setRetailer] = useState<Retailer>('kroger');
  const [zip, setZip] = useState('');
  const [stores, setStores] = useState<Store[]>([]);
  const [locationId, setLocationId] = useState('');
  const [connected, setConnected] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [excluded, setExcluded] = useState<Excluded[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ label: string; url: string } | null>(null);

  useEffect(() => {
    api.krogerStatus().then((s) => setConnected(s.connected)).catch(() => undefined);
    try {
      const saved = localStorage.getItem('haul.store');
      if (saved) setLocationId(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const readRecipe = () =>
    run('read', async () => {
      const s = source.trim();
      const r = await api.importRecipe(/^https?:\/\//i.test(s) ? { url: s } : { text: s });
      setRecipe(r);
      setServings(r.servings ?? '');
      setHave(new Set());
      setRows([]);
      setDone(null);
    });

  const findStores = () => run('stores', async () => setStores(await api.stores(zip)));

  const build = () =>
    run('build', async () => {
      if (!recipe) return;
      const res = await api.buildBasket({
        title: recipe.title ?? 'Haul list',
        recipes: [{ recipe, servings: servings || undefined }],
        have: [...have],
        retailer,
        locationId: retailer === 'kroger' ? locationId : undefined,
      });
      setDraftId(res.draftId);
      setExcluded(res.excluded);
      setRows(res.lines.map((line) => ({ line, on: line.confidence !== 'ambiguous' && (retailer === 'instacart' || !!line.pick), choice: line.pick, packs: line.packs })));
      setDone(null);
    });

  const total = useMemo(
    () => rows.filter((r) => r.on && r.choice).reduce((s, r) => s + ((r.choice!.promoPriceCents ?? r.choice!.priceCents) ?? 0) * r.packs, 0),
    [rows],
  );
  const selected = rows.filter((r) => r.on && (retailer === 'instacart' || r.choice?.upc));

  const send = () =>
    run('send', async () => {
      if (!draftId) return;
      if (retailer === 'instacart') {
        const { url } = await api.sendToInstacart(draftId, selected.map((r) => r.line.need.key));
        setDone({ label: 'Open In Instacart', url });
      } else {
        try {
          const res = await api.addToKroger(draftId, selected.map((r) => ({ key: r.line.need.key, upc: r.choice!.upc!, packs: r.packs })), 'PICKUP');
          setDone({ label: `Added ${res.added} Items. Check Out At Kroger`, url: res.checkoutUrl });
        } catch (e) {
          if ((e as { status?: number }).status === 401) {
            window.location.href = `${API}/auth/kroger/start?returnTo=/`;
            return;
          }
          throw e;
        }
      }
      setRows([]);
      setDraftId(null);
    });

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <main>
      <section className="stack">
        <div className="panel stack">
          <h2>Recipe</h2>
          <div>
            <label htmlFor="src">Link Or Ingredients</label>
            <textarea id="src" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Paste a recipe link, or the ingredient list from ChatGPT or a blog" />
          </div>
          <button className="btn" disabled={!source.trim() || busy !== null} onClick={readRecipe}>
            {busy === 'read' ? 'Reading…' : 'Read Recipe'}
          </button>
        </div>

        <div className="panel stack">
          <h2>Store</h2>
          <div className="seg" role="group" aria-label="Retailer">
            {(['kroger', 'instacart'] as const).map((r) => (
              <button key={r} aria-pressed={retailer === r} onClick={() => setRetailer(r)}>
                {r === 'kroger' ? 'Kroger Cart' : 'Instacart List'}
              </button>
            ))}
          </div>
          {retailer === 'kroger' ? (
            <>
              <div className="row">
                <input type="text" inputMode="numeric" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} placeholder="ZIP" aria-label="ZIP code" />
                <button className="btn ghost" disabled={zip.length !== 5 || busy !== null} onClick={findStores}>
                  Find
                </button>
              </div>
              {stores.length > 0 && (
                <select
                  aria-label="Kroger store"
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value);
                    try {
                      localStorage.setItem('haul.store', e.target.value);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <option value="">Choose A Store</option>
                  {stores.map((s) => (
                    <option key={s.locationId} value={s.locationId}>
                      {s.name} · {s.address?.addressLine1}
                    </option>
                  ))}
                </select>
              )}
              <p className="muted">
                {connected ? 'Kroger account connected.' : 'You’ll sign in to Kroger the first time you add to cart.'}
              </p>
            </>
          ) : (
            <p className="muted">Instacart opens your list and lets you pick any store near you.</p>
          )}
        </div>
      </section>

      <section className="stack">
        {error && <p className="err" role="alert">{error}</p>}
        {done && (
          <div className="panel row" style={{ justifyContent: 'space-between' }}>
            <span>Your cart is ready. Review it before checkout.</span>
            <a className="btn accent" href={done.url} target="_blank" rel="noopener noreferrer">{done.label}</a>
          </div>
        )}

        {recipe && rows.length === 0 && (
          <div className="panel stack">
            <h2>{recipe.title ?? 'Ingredients'}</h2>
            <div className="row">
              <label htmlFor="srv" style={{ margin: 0 }}>Servings</label>
              <input id="srv" type="number" min={1} max={50} style={{ width: 90 }} value={servings} onChange={(e) => setServings(e.target.value ? Number(e.target.value) : '')} />
            </div>
            <p className="muted">Tap anything you already have.</p>
            <div className="chips">
              {recipe.ingredients.map((ing, i) => {
                const on = have.has(ing.name);
                return (
                  <button
                    key={i}
                    className="chip"
                    style={{ border: 0, cursor: 'pointer', textDecoration: on ? 'line-through' : 'none', opacity: on ? 0.55 : 1 }}
                    aria-pressed={on}
                    onClick={() => setHave((h) => { const n = new Set(h); on ? n.delete(ing.name) : n.add(ing.name); return n; })}
                  >
                    {ing.name}
                  </button>
                );
              })}
            </div>
            <button className="btn" disabled={busy !== null || (retailer === 'kroger' && !locationId)} onClick={build}>
              {busy === 'build' ? 'Matching Products…' : 'Build My List'}
            </button>
            {retailer === 'kroger' && !locationId && <p className="muted">Choose a store first.</p>}
          </div>
        )}

        {rows.length > 0 && (
          <div className="panel">
            <h2>Review</h2>
            <table>
              <thead>
                <tr><th /><th>Recipe Needs</th><th>{retailer === 'kroger' ? 'Product' : 'Instacart Searches For'}</th>{retailer === 'kroger' && <><th>Qty</th><th>Price</th></>}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const options = [r.line.pick, ...r.line.alternates].filter((p): p is RetailProduct => !!p);
                  return (
                    <tr key={r.line.need.key}>
                      <td><input type="checkbox" checked={r.on} onChange={(e) => update(i, { on: e.target.checked })} aria-label={`Include ${r.line.need.name}`} /></td>
                      <td>
                        <span className={`dot ${r.line.confidence}`} aria-label={r.line.confidence} />
                        {r.line.need.name}
                        <div className="src">{r.line.need.sources.join(' · ')}</div>
                      </td>
                      <td>
                        {retailer === 'kroger' ? (
                          options.length ? (
                            <>
                              <select value={r.choice?.productId ?? ''} onChange={(e) => update(i, { choice: options.find((o) => o.productId === e.target.value) ?? null })}>
                                {options.map((o) => (
                                  <option key={o.productId} value={o.productId}>{o.description} · {o.sizeText ?? '?'}</option>
                                ))}
                              </select>
                              <div className="src">{r.line.reason}</div>
                            </>
                          ) : (
                            <span className="muted">Not found at this store</span>
                          )
                        ) : (
                          <span>{r.line.need.name}</span>
                        )}
                      </td>
                      {retailer === 'kroger' && (
                        <>
                          <td><input type="number" min={1} max={12} style={{ width: 58 }} value={r.packs} onChange={(e) => update(i, { packs: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })} aria-label="Quantity" /></td>
                          <td className="price">{money(unitCents(r.choice) === null ? null : unitCents(r.choice)! * r.packs)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {excluded.length > 0 && (
              <p className="muted" style={{ marginTop: 12 }}>
                Left out: {excluded.map((e) => `${e.key} (${REASON[e.reason]})`).join(', ')}
              </p>
            )}
            <div className="foot">
              <span className="muted">
                {selected.length} items{retailer === 'kroger' ? ` · about ${money(total)} before tax` : ''}. Nothing is bought until you check out.
              </span>
              <button className="btn accent" disabled={selected.length === 0 || busy !== null} onClick={send}>
                {busy === 'send' ? 'Sending…' : retailer === 'kroger' ? `Add ${selected.length} To Kroger Cart` : 'Send To Instacart'}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
