'use client';

import type { Confidence, RetailProduct } from '@haul/core';
import { useState } from 'react';
import { money, priceOf, titleCase } from '../lib/format';
import { choiceOf, optionsOf, type Cart, type Row } from '../lib/useCart';
import { Stepper } from './Stepper';
import { Thumb } from './Thumb';

const BADGE: Record<Confidence, string> = { high: 'Match', check: 'Check', ambiguous: 'Pick One' };
const MAX_PACKS = 24;

function subline(p: RetailProduct | null): string {
  return [p?.brand, p?.sizeText].filter(Boolean).join(' · ');
}

function Price({ product, packs }: { product: RetailProduct | null; packs: number }) {
  const unit = priceOf(product);
  if (unit === null) return <span className="price muted">–</span>;
  const promo = product?.promoPriceCents != null && product.priceCents != null && product.promoPriceCents < product.priceCents;
  return (
    <span className="price">
      {promo && <s>{money(product.priceCents! * packs)}</s>}
      {money(unit * packs)}
    </span>
  );
}

export function LineItem({ row, cart, retailer }: { row: Row; cart: Cart; retailer: 'kroger' | 'instacart' }) {
  const [swapping, setSwapping] = useState(row.line.confidence === 'ambiguous' && row.line.alternates.length > 0);
  const { line } = row;
  const key = line.need.key;
  const choice = choiceOf(row);
  const options = optionsOf(line);
  const kroger = retailer === 'kroger';
  const pickable = !kroger || choice !== null;
  const name = titleCase(line.need.name);

  return (
    <div className={`line${row.on ? '' : ' off'}`}>
      <input
        type="checkbox"
        className="check"
        checked={row.on}
        disabled={!pickable}
        onChange={() => cart.toggleRow(key)}
        aria-label={`Include ${name}`}
      />
      <Thumb product={choice} label={choice?.description ?? line.need.name} aisle={line.aisle} />
      <div className="line-main">
        <div className="line-title">
          <strong>{kroger ? (choice?.description ?? name) : name}</strong>
          {kroger && (
            <span className={`badge ${choice ? line.confidence : 'ambiguous'}`} title={line.reason}>
              {choice ? BADGE[line.confidence] : 'No Match'}
            </span>
          )}
        </div>
        {kroger && choice && <span className="line-sub">{subline(choice)}</span>}
        <span className="math">
          {kroger && choice ? (
            <>
              <span>
                Need <b>{line.needText ?? 'Any Size'}</b>
              </span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
              <span>
                Buying <b>{row.packs} × {choice.sizeText ?? 'pack'}</b>
              </span>
            </>
          ) : (
            <span>
              {line.needText ? <>Need <b>{line.needText}</b></> : 'Any size'}
              {!kroger && ' · Instacart picks'}
            </span>
          )}
        </span>
      </div>
      {kroger && (
        <div className="line-side">
          <Price product={choice} packs={row.packs} />
          <span className="line-actions">
            {choice && <Stepper label="packs" value={row.packs} max={MAX_PACKS} onChange={(n) => cart.setPacks(key, n)} />}
            {options.length > 1 && (
              <button type="button" className="btn bare" aria-expanded={swapping} onClick={() => setSwapping((s) => !s)}>
                {swapping ? 'Done' : 'Swap'}
              </button>
            )}
          </span>
        </div>
      )}
      {kroger && swapping && (
        <div className="swap">
          <p className="why" style={{ margin: 0 }}>
            {line.reason}
          </p>
          {options.map((p) => {
            const packs = line.optionPacks[p.productId] ?? 1;
            const unit = priceOf(p);
            return (
              <button
                type="button"
                key={p.productId}
                className="option"
                aria-pressed={p.productId === row.choiceId}
                onClick={() => cart.choose(key, p.productId)}
              >
                <Thumb product={p} label={p.description} aisle={line.aisle} />
                <span style={{ minWidth: 0 }}>
                  <span className="o-title" style={{ display: 'block' }}>
                    {p.description}
                  </span>
                  <span className="o-sub">{subline(p) || 'No size listed'}</span>
                </span>
                <span className="o-price">
                  {unit === null ? '–' : money(unit * packs)}
                  <small>
                    {packs} × {money(unit)}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
