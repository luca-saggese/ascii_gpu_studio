# ADR-0003: Measured glyph atlas

Accepted. Canvas 2D measures the current font's glyph coverage, then rasterizes one horizontal atlas uploaded as an R8 texture. The coverage order avoids assuming a universal glyph density ordering. Grapheme clusters beyond individual codepoints are not promised.
