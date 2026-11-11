import type { MetadataRoute } from 'next';
import { BRAND, MANIFEST_ICON_SIZES } from './lib/mark';
import { SHARE_PARAMS } from './lib/share';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Haul',
    short_name: 'Haul',
    description: 'Recipe in, cart out.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BRAND.paper,
    theme_color: BRAND.paper,
    icons: MANIFEST_ICON_SIZES.flatMap((px) =>
      (['any', 'maskable'] as const).map((purpose) => ({ src: `/icons/${px}`, sizes: `${px}x${px}`, type: 'image/png', purpose })),
    ),
    // Android lists the installed app in the share sheet. A shared recipe lands on the cart page.
    share_target: { action: '/', method: 'GET', params: SHARE_PARAMS },
  };
}
