import { describe, expect, it } from 'vitest';
import {
  calculateContentLayout,
  DEFAULT_SCENE,
  getAppearanceColors,
  validateScene,
} from '../src/core.js';

describe('scene and grid', () => {
  it('uses neutral grayscale defaults without losing custom source-color settings', () => {
    expect(getAppearanceColors(DEFAULT_SCENE.appearance)).toEqual({
      foreground: '#ffffff',
      background: '#000000',
    });
    expect(getAppearanceColors({ ...DEFAULT_SCENE.appearance, mode: 'rgb' })).toEqual({
      foreground: DEFAULT_SCENE.appearance.foreground,
      background: DEFAULT_SCENE.appearance.background,
    });
  });
  it('fits complete integer glyph cells inside the shared 1024 by 576 content bounds', () => {
    const cases = [
      [1920, 1080, 1024, 576],
      [1080, 1920, 324, 576],
      [1000, 1000, 576, 576],
      [1440, 1080, 768, 576],
    ];
    for (const [sourceWidth, sourceHeight, targetWidth, targetHeight] of cases) {
      const layout = calculateContentLayout(sourceWidth, sourceHeight, 8, 16);
      expect(layout.targetWidth).toBeCloseTo(targetWidth);
      expect(layout.targetHeight).toBeCloseTo(targetHeight);
      expect(layout.outputWidth).toBe(layout.columns * layout.cellWidth);
      expect(layout.outputHeight).toBe(layout.rows * layout.cellHeight);
      expect(layout.outputWidth).toBeLessThanOrEqual(1024);
      expect(layout.outputHeight).toBeLessThanOrEqual(576);
      expect(layout.columns).toBeGreaterThan(0);
      expect(layout.rows).toBeGreaterThan(0);
    }
  });

  it('limits cells while preserving an integer, non-empty grid', () => {
    const layout = calculateContentLayout(1920, 1080, 4, 5, 100);
    expect(layout.columns * layout.rows).toBeLessThanOrEqual(100);
    expect(() => calculateContentLayout(100, 100, 600, 600)).toThrow(/almeno una cella/);
  });

  it('accepts defaults and rejects unsafe grid and charset values', () => {
    expect(validateScene(structuredClone(DEFAULT_SCENE))).toBe(true);
    expect(DEFAULT_SCENE.typography.fontSize).toBe(8);
    expect(DEFAULT_SCENE.typography.lineHeight).toBe(1);
    expect(DEFAULT_SCENE.appearance.contrast).toBe(0.4);
    expect(DEFAULT_SCENE.edgeDetection.threshold).toBe(1);
    expect(DEFAULT_SCENE.edgeDetection.smoothing).toBe(0);
    expect(
      validateScene({
        ...structuredClone(DEFAULT_SCENE),
        typography: { ...DEFAULT_SCENE.typography, fontSize: 16, lineHeight: 0.8 },
        appearance: { ...DEFAULT_SCENE.appearance, contrast: 1 },
        edgeDetection: { ...DEFAULT_SCENE.edgeDetection, threshold: 100 },
      }),
    ).toBe(true);
    expect(() =>
      validateScene({
        ...structuredClone(DEFAULT_SCENE),
        typography: { ...DEFAULT_SCENE.typography, fontSize: 17 },
      }),
    ).toThrow(/4 e 16/);
    expect(() =>
      validateScene({
        ...structuredClone(DEFAULT_SCENE),
        appearance: { ...DEFAULT_SCENE.appearance, contrast: 0.3 },
      }),
    ).toThrow(/0,4 e 1/);
    expect(
      validateScene({
        ...structuredClone(DEFAULT_SCENE),
        appearance: { ...DEFAULT_SCENE.appearance, mode: 'bw' },
      }),
    ).toBe(true);
    expect(() => validateScene({ ...DEFAULT_SCENE, grid: { columns: 2 } })).toThrow(/16 a 320/);
    expect(() => validateScene({ ...DEFAULT_SCENE, typography: { charset: 'x' } })).toThrow(
      /charset/,
    );
    expect(() =>
      validateScene({ ...DEFAULT_SCENE, typography: { charset: 'x'.repeat(129) } }),
    ).toThrow(/charset/);
  });
});
