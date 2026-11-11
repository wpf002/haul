import { ImageResponse } from 'next/og';
import { BRAND, MARK } from './mark';

// The mark fills 58% of the tile, inside the 80% safe zone Android uses for maskable icons.
const MARK_SCALE = 0.58;

function markSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK.viewBox}" fill="none">
<path d="${MARK.basket}" fill="${BRAND.surface}"/>
<path d="${MARK.handles}" stroke="${BRAND.surface}" stroke-width="2" stroke-linecap="round"/>
<path d="${MARK.slats}" stroke="${BRAND.accent}" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;
}

/** A square PNG tile: the mark on the accent color, full bleed so platforms can apply their own mask. */
export function markImage(size: number): ImageResponse {
  const markSize = Math.round(size * MARK_SCALE);
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(markSvg())}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRAND.accent }}>
        <img src={src} width={markSize} height={markSize} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
