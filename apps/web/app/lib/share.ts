/** Query parameter names the manifest's share_target asks the OS to use. */
export const SHARE_PARAMS = { title: 'title', text: 'text', url: 'url' } as const;

const FIRST_LINK = /https?:\/\/[^\s<>"']+/i;
// Punctuation that ends a sentence around a link, e.g. "Try this: https://x.com/chili."
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;
const MAX_SHARED_CHARS = 20_000;

function firstLink(value: string | null): string | null {
  const match = value?.match(FIRST_LINK)?.[0];
  return match ? match.replace(TRAILING_PUNCTUATION, '') : null;
}

/**
 * What to import from a share-sheet hand-off: the recipe link if there is one, otherwise the shared text
 * (an ingredient list copied from a note). Apps disagree on which field holds the link, so all three are checked.
 */
export function sharedRecipeSource(params: URLSearchParams): string | null {
  const fields = [params.get(SHARE_PARAMS.url), params.get(SHARE_PARAMS.text), params.get(SHARE_PARAMS.title)];
  for (const field of fields) {
    const link = firstLink(field);
    if (link) return link;
  }
  const text = params.get(SHARE_PARAMS.text)?.trim();
  return text ? text.slice(0, MAX_SHARED_CHARS) : null;
}
