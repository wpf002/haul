'use client';

import type { Retailer } from '../lib/api';
import { plural } from '../lib/format';
import { MAX_RECIPES, type Cart } from '../lib/useCart';
import { Composer } from './Composer';
import { Segmented } from './Segmented';
import { Stepper } from './Stepper';
import { StorePicker } from './StorePicker';

const MAX_SERVINGS = 24;

export function Rail({ cart }: { cart: Cart }) {
  const instacartOn = cart.config ? cart.config.demo || cart.config.instacart : false;
  const retailers: Array<{ value: Retailer; label: string }> = [
    { value: 'kroger', label: 'Kroger Cart' },
    ...(instacartOn ? [{ value: 'instacart' as const, label: 'Instacart List' }] : []),
  ];
  const needsStore = cart.retailer === 'kroger' && !cart.locationId;
  const full = cart.recipes.length >= MAX_RECIPES;

  return (
    <aside className="rail">
      <section className="card">
        <header className="card-head">
          <h2>Recipes</h2>
          <span className="num muted" style={{ fontSize: 'var(--t-xs)' }}>
            {cart.recipes.length}/{MAX_RECIPES}
          </span>
        </header>
        <div className="card-body">
          <div>
            {cart.recipes.map((r) => (
              <div className="recipe-row" key={r.id}>
                <span className="title" title={r.recipe.title ?? undefined}>
                  {r.recipe.title ?? 'Untitled Recipe'}
                </span>
                <span className="controls">
                  <Stepper
                    label="servings"
                    value={r.servings ?? r.recipe.servings ?? 4}
                    max={MAX_SERVINGS}
                    onChange={(n) => cart.setServings(r.id, n)}
                  />
                  <button type="button" className="btn bare" aria-label={`Remove ${r.recipe.title ?? 'recipe'}`} onClick={() => cart.removeRecipe(r.id)}>
                    ×
                  </button>
                </span>
                <span className="meta">
                  {plural(r.recipe.ingredients.length, 'item')}
                  <span aria-hidden="true">·</span>
                  {r.servings ? `Serves ${r.servings}` : 'Servings unknown'}
                </span>
              </div>
            ))}
          </div>
          {!full && <Composer compact onSubmit={cart.addRecipe} busy={cart.busy === 'read'} />}
        </div>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>Shop At</h2>
        </header>
        <div className="card-body">
          {retailers.length > 1 && <Segmented label="Retailer" value={cart.retailer} options={retailers} onChange={cart.setRetailer} />}
          {cart.retailer === 'kroger' && (
            <StorePicker selectedId={cart.locationId} selectedName={cart.store?.name ?? 'Saved Store'} onPick={cart.setStore} />
          )}
          <button
            type="button"
            className="btn lg"
            disabled={cart.recipes.length === 0 || needsStore || cart.busy !== null}
            onClick={() => void cart.build()}
            title={needsStore ? 'Pick a store first' : undefined}
          >
            {cart.busy === 'build' ? 'Matching…' : cart.review ? 'Rebuild Cart' : 'Build Cart'}
          </button>
          {cart.error && !cart.review && (
            <p className="error" role="alert" style={{ margin: 0 }}>
              {cart.error}
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}
