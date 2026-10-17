import { describe, expect, it } from 'vitest';
import { createEdgeMap, edgeMagnitude } from '../src/edge-detection.js';

function verticalStep(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = x < width / 2 ? 0 : 255;
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return data;
}

describe('Sobel edge detection', () => {
  it('uses a fixed gradient scale so higher thresholds retain fewer edges', () => {
    const data = verticalStep(12, 8);
    const options = { threshold: 16, smoothing: 0, mode: 'edges', intensity: 1 };
    const low = createEdgeMap(data, 12, 8, options);
    const high = createEdgeMap(data, 12, 8, { ...options, threshold: 240 });
    expect(Math.min(...low)).toBeLessThan(1);
    expect(Math.min(...high)).toBe(1);
  });

  it('applies gaussian smoothing without changing the fixed threshold scale', () => {
    const data = verticalStep(12, 8);
    const options = { threshold: 0, mode: 'edges', intensity: 1 };
    const crisp = createEdgeMap(data, 12, 8, { ...options, smoothing: 0 });
    const smooth = createEdgeMap(data, 12, 8, { ...options, smoothing: 2 });
    expect(Math.min(...crisp)).toBeLessThan(Math.min(...smooth));
  });

  it('matches the reference Sobel magnitude after reusing precomputed luminance', () => {
    const width = 8;
    const height = 7;
    const data = verticalStep(width, height);
    for (const smoothing of [0, 1, 3]) {
      const actual = createEdgeMap(data, width, height, {
        threshold: 0,
        smoothing,
        mode: 'edges',
        intensity: 0.65,
      });
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const expected = 1 - edgeMagnitude(data, width, height, x, y, smoothing);
          expect(actual[y * width + x]).toBeCloseTo(expected, 6);
          expect(data[offset + 3]).toBe(255);
        }
      }
    }
  });
});
