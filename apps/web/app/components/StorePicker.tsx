'use client';

import { useState } from 'react';
import { api, type Store } from '../lib/api';

const ZIP = /^\d{5}$/;

function addressOf(s: Store): string {
  const a = s.address;
  return [a?.addressLine1, a?.city, a?.state].filter(Boolean).join(', ');
}

interface Props {
  selectedId: string | null;
  selectedName?: string | null;
  onPick: (s: Store) => void;
}

export function StorePicker({ selectedId, selectedName, onPick }: Props) {
  const [zip, setZip] = useState('');
  const [stores, setStores] = useState<Store[] | null>(null);
  const [open, setOpen] = useState(!selectedId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!ZIP.test(zip)) return;
    setBusy(true);
    setError(null);
    try {
      const found = await api.stores(zip);
      setStores(found);
      if (found.length === 0) setError('No stores near that ZIP');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Store search failed');
    } finally {
      setBusy(false);
    }
  };

  if (selectedId && !open) {
    return (
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <span className="status on">{selectedName ?? 'Store set'}</span>
        <button type="button" className="btn bare" onClick={() => setOpen(true)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="store-list">
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label className="sr-only" htmlFor="zip">
          ZIP code
        </label>
        <input
          id="zip"
          className="input"
          inputMode="numeric"
          maxLength={5}
          placeholder="ZIP"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))}
        />
        <button className="btn quiet" disabled={!ZIP.test(zip) || busy}>
          {busy ? 'Finding…' : 'Find Stores'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {stores?.map((s) => (
        <button
          key={s.locationId}
          type="button"
          className="store"
          aria-pressed={s.locationId === selectedId}
          onClick={() => {
            onPick(s);
            setOpen(false);
          }}
        >
          <span>
            {s.name}
            <small>{addressOf(s)}</small>
          </span>
          {s.locationId === selectedId && <span className="badge high">Set</span>}
        </button>
      ))}
    </div>
  );
}
