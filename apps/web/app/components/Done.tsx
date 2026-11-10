import type { Sent } from '../lib/useCart';
import { plural } from '../lib/format';

export function Done({ sent, onStartOver }: { sent: Sent; onStartOver: () => void }) {
  const kroger = sent.retailer === 'kroger';
  return (
    <section className="done" aria-live="polite">
      <span className="mark" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h2>{kroger ? 'In Your Kroger Cart' : 'List Ready'}</h2>
      <p className="num">
        {plural(sent.count, 'item')}
        {sent.demo ? ' · Demo' : ''}
      </p>
      <div className="row">
        <a className="btn lg" href={sent.url} target="_blank" rel="noreferrer">
          {kroger ? 'Check Out At Kroger' : 'Open Instacart'}
        </a>
        <button type="button" className="btn lg quiet" onClick={onStartOver}>
          Start Over
        </button>
      </div>
    </section>
  );
}
