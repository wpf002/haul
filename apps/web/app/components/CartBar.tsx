'use client';

import { money, plural } from '../lib/format';
import type { Cart, Review } from '../lib/useCart';
import { Segmented } from './Segmented';

export function CartBar({ cart, review }: { cart: Cart; review: Review }) {
  const kroger = review.retailer === 'kroger';
  const count = cart.selected.length;
  const perServing = cart.servings > 0 ? Math.round(cart.total / cart.servings) : null;
  const sending = cart.busy === 'send';

  return (
    <div className="cartbar">
      <div className="cartbar-inner">
        <span className="stat">
          <small>Items</small>
          <b>{count}</b>
        </span>
        {kroger && (
          <>
            <span className="stat">
              <small>Total</small>
              <b>{money(cart.total)}</b>
            </span>
            {perServing !== null && (
              <span className="stat" title={`${plural(cart.servings, 'serving')} across your recipes`}>
                <small>Per Serving</small>
                <b>{money(perServing)}</b>
              </span>
            )}
          </>
        )}
        <span className="spacer" />
        {cart.error && <span className="note" role="alert">{cart.error}</span>}
        {kroger && (
          <Segmented
            label="Fulfillment"
            value={cart.modality}
            onChange={cart.setModality}
            options={[
              { value: 'PICKUP', label: 'Pickup' },
              { value: 'DELIVERY', label: 'Delivery' },
            ]}
          />
        )}
        {kroger && !cart.connected ? (
          <button type="button" className="btn lg" onClick={cart.connectKroger} title="Sign in to Kroger. Your review stays here.">
            Connect Kroger
          </button>
        ) : (
          <button type="button" className="btn lg" disabled={count === 0 || sending} onClick={() => void cart.send()}>
            {sending ? 'Sending…' : kroger ? 'Add To Kroger' : 'Send To Instacart'}
          </button>
        )}
      </div>
    </div>
  );
}
