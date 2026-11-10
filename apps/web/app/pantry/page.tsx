'use client';

import { useEffect, useState } from 'react';
import { ChipInput } from '../components/ChipInput';
import { Segmented } from '../components/Segmented';
import { StorePicker } from '../components/StorePicker';
import { api, type Pantry, Store } from '../lib/api';
import { readStored, STORE_KEY, writeStored } from '../lib/storage';

const SAVED_FLASH_MS = 2000;

export default function PantryPage() {
  const [pantry, setPantry] = useState<Pantry | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [connected, setConnected] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStore(readStored('local', STORE_KEY, Store));
    api.pantry().then(setPantry, (e: unknown) => setError(e instanceof Error ? e.message : 'Could not load pantry'));
    api.krogerStatus().then((s) => setConnected(s.connected), (e: unknown) => console.warn('haul: kroger status unavailable', e));
  }, []);

  if (!pantry) {
    return (
      <div className="page">
        <h1 className="page-title">Pantry</h1>
        {error ? <p className="error">{error}</p> : <div className="skeleton" />}
      </div>
    );
  }

  // Same precedence as the cart: the store picked on this device wins over the saved one.
  const locationId = store?.locationId ?? pantry.krogerLocationId;

  const edit = (patch: Partial<Pantry>) => {
    setPantry({ ...pantry, ...patch });
    setDirty(true);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      setPantry(await api.savePantry({ ...pantry, krogerLocationId: locationId }));
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), SAVED_FLASH_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    try {
      setConnected((await api.disconnectKroger()).connected);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed');
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Pantry</h1>
      <div>
        <section className="section">
          <div className="section-head">
            <h2>Always Have</h2>
          </div>
          <ChipInput id="staples" label="Add a staple" placeholder="Salt, olive oil, flour" values={pantry.staples} onChange={(staples) => edit({ staples })} />
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Never Buy</h2>
          </div>
          <ChipInput id="dislikes" label="Add an ingredient to skip" placeholder="Cilantro" values={pantry.dislikes} onChange={(dislikes) => edit({ dislikes })} />
        </section>

        <section className="section">
          <h2>Picks</h2>
          <div>
            <label className="switch">
              <span>Store Brand First</span>
              <input type="checkbox" checked={pantry.preferStoreBrand} onChange={(e) => edit({ preferStoreBrand: e.target.checked })} />
            </label>
            <label className="switch">
              <span>Organic First</span>
              <input type="checkbox" checked={pantry.preferOrganic} onChange={(e) => edit({ preferOrganic: e.target.checked })} />
            </label>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Kroger</h2>
            <span className={`status${connected ? ' on' : ''}`}>{connected ? 'Connected' : 'Not Connected'}</span>
          </div>
          <StorePicker
            selectedId={locationId}
            selectedName={store?.name ?? 'Saved Store'}
            onPick={(s) => {
              setStore(s);
              writeStored('local', STORE_KEY, s);
              edit({ krogerLocationId: s.locationId });
            }}
          />
          <div className="section-head">
            <Segmented
              label="Fulfillment"
              value={pantry.modality}
              onChange={(modality) => edit({ modality })}
              options={[
                { value: 'PICKUP', label: 'Pickup' },
                { value: 'DELIVERY', label: 'Delivery' },
              ]}
            />
            {connected ? (
              <button type="button" className="btn quiet" onClick={() => void disconnect()}>
                Disconnect
              </button>
            ) : (
              <a className="btn quiet" href={api.krogerConnectUrl('/pantry')}>
                Connect Kroger
              </a>
            )}
          </div>
        </section>

        <section className="section">
          <div className="inline">
            <button type="button" className="btn lg" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saved && <span className="saved">Saved</span>}
            {error && <span className="error">{error}</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
