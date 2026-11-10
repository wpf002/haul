'use client';

import { AISLES, type Aisle } from '@haul/core';
import { useState } from 'react';
import type { Excluded } from '../lib/api';
import { money, plural, titleCase } from '../lib/format';
import { lineTotal, needsLook, type Cart, type Review as ReviewState, type Row } from '../lib/useCart';
import { LineItem } from './LineItem';
import { Segmented } from './Segmented';

type Filter = 'all' | 'look';

const SKIP_REASON: Record<Excluded['reason'], string> = {
  pantry: 'Pantry staple',
  have: 'You have it',
  optional: 'Optional',
  dislike: 'On your skip list',
};

function byAisle(rows: Row[]): Array<[Aisle, Row[]]> {
  return AISLES.map((a) => [a, rows.filter((r) => r.line.aisle === a)] as [Aisle, Row[]]).filter(([, rs]) => rs.length > 0);
}

const aisleTotal = (rows: Row[]) => rows.reduce((s, r) => s + lineTotal(r), 0);

export function Review({ cart, review }: { cart: Cart; review: ReviewState }) {
  const [filter, setFilter] = useState<Filter>('all');
  const look = review.rows.filter(needsLook).length;
  const kroger = review.retailer === 'kroger';
  const shown = filter === 'look' ? review.rows.filter(needsLook) : review.rows;
  const groups = byAisle(shown);

  return (
    <div className="main">
      <header className="main-head">
        <div>
          <h2>{kroger ? 'Review Cart' : 'Review List'}</h2>
          <p className="sub num">
            {plural(review.rows.length, 'item')} · {plural(byAisle(review.rows).length, 'aisle')}
          </p>
        </div>
        {kroger && look > 0 && (
          <Segmented
            label="Filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'look', label: `Needs A Look (${look})` },
            ]}
          />
        )}
      </header>

      {groups.map(([aisle, rows]) => (
        <section className="aisle" key={aisle} aria-label={aisle}>
          <header className="aisle-head">
            <h3>{aisle}</h3>
            <span className="count">{rows.length}</span>
            {kroger && <span className="sum">{money(aisleTotal(rows))}</span>}
          </header>
          {rows.map((r) => (
            <LineItem key={r.line.need.key} row={r} cart={cart} retailer={review.retailer} />
          ))}
        </section>
      ))}

      {review.excluded.length > 0 && (
        <div className="skipped">
          <span className="label">Skipped</span>
          {review.excluded.map((x) => (
            <span className="skip" key={`${x.key}-${x.raw}`} title={`${SKIP_REASON[x.reason]}: ${x.raw}`}>
              {titleCase(x.key)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
