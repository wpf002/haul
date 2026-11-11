/** The basket mark, drawn on a 26-unit grid. Shared by the header wordmark and every app icon. */
export const MARK = {
  viewBox: '0 0 26 26',
  basket: 'M3 8h20l-2.2 11.2A3 3 0 0 1 17.86 22H8.14a3 3 0 0 1-2.94-2.8L3 8Z',
  handles: 'M8.5 8 11 3.5M17.5 8 15 3.5',
  slats: 'M9 13.5h8M10 17h6',
} as const;

/** Mirrors --accent, --surface and --bg in globals.css. Icons and the manifest can't read CSS variables. */
export const BRAND = { accent: '#c43d22', surface: '#fbf9f4', paper: '#f3eee3', night: '#141a15' } as const;

/** Manifest icon sizes. Android needs 192 and 512 to install. */
export const MANIFEST_ICON_SIZES = [192, 512] as const;
