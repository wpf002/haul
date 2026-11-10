/**
 * Minimal Claude Messages API call that expects a JSON object back.
 * Shared by the reranker and the recipe extractor. Returns null on any failure so
 * callers fall back to deterministic behavior.
 */
export interface ClaudeJsonOptions {
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 15_000;

export async function askClaudeJson(opts: ClaudeJsonOptions): Promise<unknown | null> {
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: { 'x-api-key': opts.apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify({ model: opts.model, max_tokens: opts.maxTokens, messages: [{ role: 'user', content: opts.prompt }] }),
    });
  } catch {
    // Network error or timeout. The caller's deterministic path takes over.
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { content?: Array<{ type: string; text?: string }> } | null;
  const text = body?.content?.find((c) => c.type === 'text')?.text ?? '';
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}
