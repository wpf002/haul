import { MANIFEST_ICON_SIZES } from '../../lib/mark';
import { markImage } from '../../lib/markImage';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return MANIFEST_ICON_SIZES.map((px) => ({ size: String(px) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const px = Number((await params).size);
  if (!MANIFEST_ICON_SIZES.some((allowed) => allowed === px)) return new Response('Not found', { status: 404 });
  return markImage(px);
}
