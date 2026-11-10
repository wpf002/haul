'use client';

import { useState } from 'react';

interface Props {
  onSubmit: (source: string) => Promise<void>;
  busy: boolean;
  disabled?: boolean;
  compact?: boolean;
}

/** One box for either a recipe link or a pasted ingredient list. */
export function Composer({ onSubmit, busy, disabled = false, compact = false }: Props) {
  const [source, setSource] = useState('');
  const ready = source.trim().length > 0 && !busy && !disabled;

  const submit = async () => {
    if (!ready) return;
    await onSubmit(source);
    setSource('');
  };

  return (
    <form
      className={compact ? 'add-more' : 'composer'}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="sr-only" htmlFor={compact ? 'source-more' : 'source'}>
        Recipe link or ingredient list
      </label>
      <textarea
        id={compact ? 'source-more' : 'source'}
        className={compact ? 'input' : undefined}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
        }}
        placeholder={compact ? 'Add another link or list' : 'Paste a recipe link or ingredient list'}
        disabled={disabled}
        autoFocus={!compact}
      />
      <div className={compact ? 'inline' : 'composer-foot'}>
        {!compact && <span className="muted">Up to 5 recipes</span>}
        <button className={compact ? 'btn quiet' : 'btn lg'} disabled={!ready} style={compact ? { width: '100%' } : undefined}>
          {busy ? 'Reading…' : 'Add Recipe'}
        </button>
      </div>
    </form>
  );
}
