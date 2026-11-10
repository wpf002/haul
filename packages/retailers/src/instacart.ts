import type { ShoppingNeed } from '@haul/core';
import { z } from 'zod';
import { type HandoffAdapter, RetailerError } from './types';

export interface InstacartConfig {
  apiKey: string;
  /** https://connect.dev.instacart.tools (dev) or https://connect.instacart.com (prod) */
  apiBase: string;
  linkbackUrl?: string;
  fetch?: typeof fetch;
}

const LinkResponse = z.object({ products_link_url: z.string().url() });

// Instacart only accepts its own unit vocabulary. Map our base units to it.
function measurement(need: ShoppingNeed): { quantity: number; unit: string } {
  if (need.amount === null) return { quantity: 1, unit: 'each' };
  switch (need.dimension) {
    case 'mass':
      return need.amount >= 453.592
        ? { quantity: round(need.amount / 453.592), unit: 'pound' }
        : { quantity: round(need.amount / 28.3495), unit: 'ounce' };
    case 'volume':
      return need.amount >= 236.588
        ? { quantity: round(need.amount / 236.588), unit: 'cup' }
        : { quantity: round(need.amount / 14.7868), unit: 'tablespoon' };
    case 'count':
      return { quantity: Math.max(1, Math.ceil(need.amount)), unit: 'each' };
    default:
      return { quantity: 1, unit: 'each' };
  }
}
const round = (n: number) => Math.max(0.1, Math.round(n * 10) / 10);

/**
 * Instacart Developer Platform: creates a shopping list page. The user picks any
 * participating store, reviews, and adds to their own Instacart cart. We never touch it.
 */
export class InstacartClient implements HandoffAdapter {
  readonly id = 'instacart';
  private readonly f: typeof fetch;
  constructor(private readonly cfg: InstacartConfig) {
    this.f = cfg.fetch ?? fetch;
  }

  async createList(input: { title: string; needs: ShoppingNeed[]; upcs?: Record<string, string[]> }): Promise<{ url: string }> {
    const body = {
      title: input.title.slice(0, 120),
      link_type: 'shopping_list',
      expires_in: 7,
      line_items: input.needs.map((n) => {
        const upcs = input.upcs?.[n.key]?.filter((u) => /^\d{12}$|^\d{14}$/.test(u));
        return {
          name: n.name,
          display_text: n.name,
          line_item_measurements: [measurement(n)],
          ...(upcs?.length ? { upcs } : {}),
        };
      }),
      ...(this.cfg.linkbackUrl ? { landing_page_configuration: { partner_linkback_url: this.cfg.linkbackUrl } } : {}),
    };
    const res = await this.f(`${this.cfg.apiBase.replace(/\/$/, '')}/idp/v1/products/products_link`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.cfg.apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new RetailerError('instacart', res.status, 'products_link failed');
    return { url: LinkResponse.parse(await res.json()).products_link_url };
  }
}
