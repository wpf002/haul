import type { Aisle, RetailProduct } from '@haul/core';
import { aisleTint, initials } from '../lib/format';

export function Thumb({ product, label, aisle }: { product: RetailProduct | null; label: string; aisle: Aisle }) {
  return (
    <span className="thumb" style={{ background: aisleTint(aisle) }} aria-hidden="true">
      {product?.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : initials(label)}
    </span>
  );
}
