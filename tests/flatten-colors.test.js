import { describe, expect, it } from 'vitest';
import { buildColorPalette, flattenPixelData, paletteAsHex } from '../src/flatten-colors.js';

function splitColorImage() {
  const data = new Uint8ClampedArray(8 * 4 * 4);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const offset = (y * 8 + x) * 4;
      const shade = x < 4 ? 0 : 255;
      data[offset] = shade;
      data[offset + 1] = shade;
      data[offset + 2] = shade;
      data[offset + 3] = 255;
    }
  }
  return { data, width: 8, height: 4 };
}

describe('Flatten Colors', () => {
  it('generates a bounded palette and assigns every output pixel to it', () => {
    const image = splitColorImage();
    const palette = buildColorPalette([image], 2, 0);
    const flattened = flattenPixelData(image, { smoothing: 0 }, palette);
    const entries = new Set(paletteAsHex(palette));
    for (let offset = 0; offset < flattened.data.length; offset += 4) {
      const hex = `#${[...flattened.data.slice(offset, offset + 3)]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`;
      expect(entries.has(hex)).toBe(true);
    }
    expect(entries.size).toBe(2);
  });

  it('uses smoothing as an independent input to palette construction', () => {
    const image = splitColorImage();
    expect(buildColorPalette([image], 16, 3)).toHaveLength(16);
    expect(buildColorPalette([image, image], 4, 3)).toHaveLength(4);
  });
});
