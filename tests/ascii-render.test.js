import { describe, expect, it } from 'vitest';
import { renderAsciiPage } from '../src/ascii-render.js';

const render = {
  columns: 3,
  rows: 1,
  cellWidth: 8,
  cellHeight: 12,
  width: 24,
  height: 12,
  font: { family: 'monospace', size: 8, weight: 500, ascent: 8, descent: 2 },
  colors: { mode: 'mono', foreground: '#ffffff', background: '#000000' },
};

function draw(page) {
  const inks = [];
  const context = {
    canvas: {},
    fillRect() {},
    fillText(glyph) {
      inks.push({ glyph, color: this.fillStyle });
    },
  };
  renderAsciiPage(context, page, render);
  return inks;
}

describe('monochrome page rendering', () => {
  it('fills each entire glyph with its single stored gray, not a gradient', () => {
    expect(draw({ text: 'MMM', cellColors: [32, 32, 32, 128, 128, 128, 224, 224, 224] })).toEqual([
      { glyph: 'M', color: 'rgb(32 32 32)' },
      { glyph: 'M', color: 'rgb(128 128 128)' },
      { glyph: 'M', color: 'rgb(224 224 224)' },
    ]);
  });

  it('uses serialized grayscale cells for PNG, MP4 and offline HTML', () => {
    const colors = btoa(String.fromCharCode(32, 32, 32, 128, 128, 128, 224, 224, 224));
    expect(draw({ text: 'MMM', colors })).toEqual(
      draw({ text: 'MMM', cellColors: [32, 32, 32, 128, 128, 128, 224, 224, 224] }),
    );
  });

  it('retains the foreground of legacy monochrome documents without cell colors', () => {
    expect(draw({ text: 'MMM' }).every((ink) => ink.color === '#ffffff')).toBe(true);
  });
});
