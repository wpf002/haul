import type { RetailProduct, ShoppingNeed } from '@haul/core';

export interface SearchOptions {
  locationId: string;
  limit?: number;
}

/** A retailer that exposes a product catalog. */
export interface CatalogAdapter {
  readonly id: RetailProduct['retailer'];
  search(term: string, opts: SearchOptions): Promise<RetailProduct[]>;
}

export interface CartLine {
  upc: string;
  quantity: number;
}

/** A retailer that can write to the shopper's own cart (Kroger). */
export interface CartAdapter {
  readonly id: RetailProduct['retailer'];
  addToCart(accessToken: string, lines: CartLine[], modality: 'PICKUP' | 'DELIVERY'): Promise<void>;
  checkoutUrl(): string;
}

/** A retailer we can only hand a list to (Instacart). The user picks the store and adds. */
export interface HandoffAdapter {
  readonly id: string;
  createList(input: { title: string; needs: ShoppingNeed[]; upcs?: Record<string, string[]> }): Promise<{ url: string }>;
}

export class RetailerError extends Error {
  constructor(
    readonly retailer: string,
    readonly status: number,
    message: string,
  ) {
    super(`${retailer}: ${message}`);
  }
}
