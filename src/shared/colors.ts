export const CAR_COLORS = [
  { key: 'red', hex: 0xff6b6b },
  { key: 'yellow', hex: 0xffd166 },
  { key: 'mint', hex: 0x4fd8b6 },
  { key: 'blue', hex: 0x6aa9ff },
  { key: 'purple', hex: 0xc78bff },
  { key: 'orange', hex: 0xff9a5c },
  { key: 'pink', hex: 0xff8ec7 },
  { key: 'lime', hex: 0xa8e05f },
] as const;

export type ColorKey = (typeof CAR_COLORS)[number]['key'];

export const COLOR_KEYS: ColorKey[] = CAR_COLORS.map((c) => c.key);

export function colorHex(key: string): number {
  return CAR_COLORS.find((c) => c.key === key)?.hex ?? 0xffffff;
}

export function colorCss(key: string): string {
  return `#${colorHex(key).toString(16).padStart(6, '0')}`;
}

/** The planet itself — warm sand, so saturated toy cars pop against it. */
export const PLANET_HEX = 0xe7d3ac;
export const PLANET_DARK_HEX = 0xcbb98f;
export const ATMOSPHERE_HEX = 0x9fd8ff;
