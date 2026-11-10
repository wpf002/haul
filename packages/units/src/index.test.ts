import { describe, expect, it } from 'vitest';
import { normalizeNumerals, parseNumber, parseRetailSize, planPacks, toBase } from './index';

describe('numbers', () => {
  it('parses fractions and mixed numbers', () => {
    expect(parseNumber('1/2')).toBe(0.5);
    expect(parseNumber('1 1/2')).toBe(1.5);
    expect(parseNumber('.25')).toBe(0.25);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('1/0')).toBeNull();
  });
  it('normalizes unicode fractions', () => {
    expect(normalizeNumerals('1½ cups')).toBe('1 1/2 cups');
    expect(normalizeNumerals('⅓ cup')).toBe('1/3 cup');
  });
});

describe('retail sizes', () => {
  it('reads common Kroger size strings', () => {
    expect(parseRetailSize('28 oz')?.base).toBeCloseTo(793.8, 0);
    expect(parseRetailSize('1 lb')?.dimension).toBe('mass');
    expect(parseRetailSize('64 fl oz')?.dimension).toBe('volume');
    expect(parseRetailSize('12 ct')).toEqual({ base: 12, dimension: 'count' });
    expect(parseRetailSize('6 x 12 fl oz')?.base).toBeCloseTo(6 * 354.88, 0);
    expect(parseRetailSize('1 gal')?.base).toBeCloseTo(3785.4, 0);
    expect(parseRetailSize('weird')).toBeNull();
  });
});

describe('pack planning', () => {
  it('one 28oz can covers a 28oz need', () => {
    const need = toBase(28, 'oz');
    expect(planPacks(need.base, need.dimension, parseRetailSize('28 oz'), 'crushed tomatoes').packs).toBe(1);
  });
  it('two 15oz cans for 30oz', () => {
    const need = toBase(30, 'oz');
    expect(planPacks(need.base, 'mass', parseRetailSize('15 oz'), 'black beans').packs).toBe(2);
  });
  it('converts onion count to weight', () => {
    const plan = planPacks(3, 'count', parseRetailSize('3 lb'), 'onion');
    expect(plan.packs).toBe(1);
    expect(plan.estimated).toBe(true);
  });
  it('volume to mass via density', () => {
    const need = toBase(4, 'cup'); // ~946 ml flour ~ 501 g
    const plan = planPacks(need.base, 'volume', parseRetailSize('5 lb'), 'all-purpose flour');
    expect(plan.packs).toBe(1);
  });
  it('caps runaway pack counts', () => {
    expect(planPacks(100_000, 'mass', parseRetailSize('1 oz'), 'x').packs).toBe(12);
  });
  it('buys one when sizes are not comparable', () => {
    expect(planPacks(400, 'mass', { base: 1, dimension: 'count' }, 'tomatoes')).toMatchObject({ packs: 1, estimated: true });
  });
});
