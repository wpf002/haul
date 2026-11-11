import { markImage } from './lib/markImage';

const APPLE_TOUCH_PX = 180;

export const size = { width: APPLE_TOUCH_PX, height: APPLE_TOUCH_PX };
export const contentType = 'image/png';

export default function AppleIcon() {
  return markImage(APPLE_TOUCH_PX);
}
