# ADR-0003: Measured glyph atlas

Accepted. Canvas 2D measures the current font's glyph coverage and cell metrics, then rasterizes one horizontal atlas uploaded as a WebGL texture. The output cell dimensions follow measured advance/ascent/descent. The renderer rounds luminance selection to an atlas index and samples the full two-dimensional glyph tile. The coverage order avoids assuming a universal glyph density ordering. Grapheme clusters beyond individual codepoints are not promised.
