# Architecture

The project is a local-first Vue 3/Vite application using JavaScript ES modules. The Studio UI owns source-file and native media-element lifecycles; the renderer owns a WebGL2 canvas, source texture, glyph atlas, shaders, and cleanup. The video element is the sole audio clock, so playback audio remains the browser's original media audio and is not analyzed or transformed.

The current renderer uses one fragment pass: per output fragment, it samples a small neighborhood of the corresponding source cell, adjusts luminance, quantizes it to a glyph-density atlas entry, and composites the result. It intentionally avoids GPU readback during playback. Shader errors are surfaced to the UI; WebGL2 absence currently reports an explicit error, with no Canvas 2D fallback yet.

Cell count is capped at 40,000. Glyph density is measured using a Canvas 2D coverage pass. Atlas is rebuilt when typography changes and GL objects are disposed with the Studio. Media is held in memory through object URLs and revoked on source replacement/unmount.

## Decisions

- No remote font/CDN dependency: privacy and offline operation outweigh decorative font matching; the interface uses system fonts.
- Node 24.20.0 is pinned in `.nvmrc`, matching the implementation environment.
- ZIP container is implemented with fflate and a 110 MiB compressed / 200 MiB expanded limit. Extraction is streamed and bounded during decompression, with path and entry-count checks.
- The GPU implementation uses a single pass rather than a separate preprocess FBO to avoid frame readback and pass overhead. It samples a 3×3 neighborhood for an inexpensive area approximation.
