import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE, gridForSource, validateScene } from '../src/core.js';

describe('scene and grid', () => {
  it('calculates rows that preserve image proportions after glyph aspect correction', () => {
    expect(gridForSource(1600, 900, 120, 0.6)).toEqual({ columns: 120, rows: 41 });
    expect(gridForSource(900, 1600, 100, 0.6).rows).toBe(107);
  });

  it('accepts defaults and rejects unsafe grid and charset values', () => {
    expect(validateScene(structuredClone(DEFAULT_SCENE))).toBe(true);
    expect(() => validateScene({ ...DEFAULT_SCENE, grid: { columns: 2 } })).toThrow(/16 a 320/);
    expect(() => validateScene({ ...DEFAULT_SCENE, typography: { charset: 'x' } })).toThrow(
      /charset/,
    );
    expect(() =>
      validateScene({ ...DEFAULT_SCENE, typography: { charset: 'x'.repeat(129) } }),
    ).toThrow(/charset/);
  });
});
