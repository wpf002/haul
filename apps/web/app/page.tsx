'use client';

import { CartBar } from './components/CartBar';
import { Composer } from './components/Composer';
import { Done } from './components/Done';
import { Ingredients } from './components/Ingredients';
import { Rail } from './components/Rail';
import { Review } from './components/Review';
import { SAMPLES } from './lib/samples';
import { useCart } from './lib/useCart';

export default function CartPage() {
  const cart = useCart();

  if (!cart.hydrated) return <div className="workspace"><div className="skeleton" /><div className="skeleton" /></div>;

  if (cart.sent) return <Done sent={cart.sent} onStartOver={cart.startOver} />;

  if (cart.recipes.length === 0) {
    return (
      <section className="hero">
        <h1>
          Recipe in.
          <br />
          <em>Cart</em> out.
        </h1>
        <Composer onSubmit={cart.addRecipe} busy={cart.busy === 'read'} />
        {cart.error && <p className="error" role="alert">{cart.error}</p>}
        <div className="samples" aria-label="Sample recipes">
          {SAMPLES.map((s) => (
            <button key={s.label} type="button" disabled={cart.busy !== null} onClick={() => void cart.addRecipe(s.text)}>
              {s.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="workspace">
        <Rail cart={cart} />
        {cart.busy === 'build' ? (
          <div className="main" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <div className="skeleton" key={i} />)}
          </div>
        ) : cart.review ? (
          <Review cart={cart} review={cart.review} />
        ) : (
          <Ingredients cart={cart} />
        )}
      </div>
      {cart.review && <CartBar cart={cart} review={cart.review} />}
    </>
  );
}
