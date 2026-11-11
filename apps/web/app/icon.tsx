import { markImage } from './lib/markImage';

const FAVICON_PX = 32;

export const size = { width: FAVICON_PX, height: FAVICON_PX };
export const contentType = 'image/png';

export default function Icon() {
  return markImage(FAVICON_PX);
}
