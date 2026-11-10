'use client';

import { useState } from 'react';
import { titleCase } from '../lib/format';

const MAX_LEN = 80;

interface Props {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}

export function ChipInput({ id, label, values, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim().toLowerCase().slice(0, MAX_LEN);
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };

  return (
    <div className="store-list">
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <input id={id} className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
        <button className="btn quiet" disabled={!draft.trim()}>
          Add
        </button>
      </form>
      {values.length > 0 && (
        <div className="chips">
          {values.map((v) => (
            <span className="chip" key={v}>
              {titleCase(v)}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
