import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RecordingCatalog } from './fixture';

// Regression: the cache held products saved before `stock` replaced `inStock`, so replays skipped stock checks.
describe('RecordingCatalog', () => {
  it('ignores cached entries that no longer match the product shape', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'haul-cache-')), 'cache.json');
    const product = { retailer: 'kroger', productId: '1', upc: null, description: 'Lentils', brand: null, sizeText: null, priceCents: null, promoPriceCents: null, categories: [], imageUrl: null };
    writeFileSync(file, JSON.stringify({ 's::old': [{ ...product, inStock: true }], 's::new': [{ ...product, stock: 'in' }] }));
    const catalog = new RecordingCatalog(null, file);
    expect(await catalog.search('old', { locationId: 's' })).toEqual([]);
    expect(await catalog.search('new', { locationId: 's' })).toHaveLength(1);
  });
});
