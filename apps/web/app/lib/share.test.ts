import { describe, expect, it } from 'vitest';
import { sharedRecipeSource } from './share';

const shared = (fields: Record<string, string>) => sharedRecipeSource(new URLSearchParams(fields));

describe('sharedRecipeSource', () => {
  it('uses the url field when the sharing app fills it', () => {
    expect(shared({ url: 'https://example.com/chili', text: 'Weeknight Chili' })).toBe('https://example.com/chili');
  });

  it('finds the link inside the text field, where most Android apps put it', () => {
    expect(shared({ title: 'Chili', text: 'Look at this one: https://example.com/chili.' })).toBe('https://example.com/chili');
  });

  it('falls back to the shared text for a pasted ingredient list', () => {
    expect(shared({ text: '  1 lb ground beef\n1 onion  ' })).toBe('1 lb ground beef\n1 onion');
  });

  it('returns null when nothing usable was shared', () => {
    expect(shared({ title: 'Chili' })).toBeNull();
    expect(shared({})).toBeNull();
  });

  it('ignores the cart page’s own query parameters', () => {
    expect(shared({ kroger: 'connected' })).toBeNull();
  });
});
