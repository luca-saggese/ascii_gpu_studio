# Architecture

The project is a local-first Vue 3/Vite application using JavaScript ES modules. The Studio UI owns source-file and native media-element lifecycles; the renderer owns a WebGL2 canvas, source texture, glyph atlas, shaders, and cleanup. The video element is the sole audio clock, so playback audio remains the browser's original media audio and is not analyzed or transformed.

The current renderer uses one fragment pass: per output fragment, it samples a small neighborhood of the corresponding source cell, adjusts luminance, quantizes it to a glyph-density atlas entry, and composites the result. It intentionally avoids GPU readback during playback. Shader errors are surfaced to the UI; WebGL2 absence currently reports an explicit error, with no Canvas 2D fallback yet.

Cell count is capped at 40,000. Glyph density, advance width, ascent, and descent are measured using Canvas 2D; the atlas tiles and output grid use those font metrics rather than a fixed oversized cell. The shader rounds density to one atlas glyph index and samples both local X and Y coordinates, so it draws the complete glyph instead of interpolating between adjacent glyphs or showing a single vertical slice. Atlas is rebuilt when typography changes and GL objects are disposed with the Studio. Media is held in memory through object URLs and revoked on source replacement/unmount.

The glyph atlas is rasterized at 2× device-pixel ratio, up to 4×, while preserving logical font metrics. The scale is reduced if needed to stay within the GPU's maximum texture dimensions. The framebuffer uses one uniform scale based on the grid's measured aspect ratio and available preview space; it never independently stretches width and height. Atlas samples are inset by half a texel to avoid adjacent-glyph bleeding under linear filtering. The status bar reports actual framebuffer pixels separately from source dimensions and cell count. An alternate plain-text preview builds a normal monospace text grid on demand; video updates in this mode use CPU canvas sampling at up to 8 fps and can be slower than GPU preview.

## Decisions

- No remote font/CDN dependency: privacy and offline operation outweigh decorative font matching; the interface uses system fonts.
- Node 24.20.0 is pinned in `.nvmrc`, matching the implementation environment.
- ZIP container is implemented with fflate and a 110 MiB compressed / 200 MiB expanded limit. Extraction is streamed and bounded during decompression, with path and entry-count checks.
- The GPU implementation uses a single pass rather than a separate preprocess FBO to avoid frame readback and pass overhead. It samples a 3×3 neighborhood for an inexpensive area approximation.
