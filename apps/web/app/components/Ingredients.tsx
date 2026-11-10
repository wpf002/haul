'use client';

import { plural } from '../lib/format';
import type { Cart } from '../lib/useCart';

export function Ingredients({ cart }: { cart: Cart }) {
  const total = cart.recipes.reduce((n, r) => n + r.recipe.ingredients.length, 0);

  return (
    <div className="main">
      <header className="main-head">
        <div>
          <h2>Ingredients</h2>
          <p className="sub num">
            {plural(total, 'item')} · {cart.have.size} on hand
          </p>
        </div>
      </header>
      <div className="ingredients">
        {cart.recipes.map((r) => (
          <section className="ing-group" key={r.id}>
            <h3>{r.recipe.title ?? 'Untitled Recipe'}</h3>
            {r.recipe.ingredients.map((ing, i) => {
              const has = cart.have.has(ing.name);
              return (
                <label className={`ing${has ? ' have' : ''}`} key={`${r.id}-${i}`}>
                  <span className="raw">{ing.raw}</span>
                  {ing.optional && <span className="tag">Optional</span>}
                  <span className="tag">Have It</span>
                  <input type="checkbox" className="check" checked={has} onChange={() => cart.toggleHave(ing.name)} />
                </label>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
