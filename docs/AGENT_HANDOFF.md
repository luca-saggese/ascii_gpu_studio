# Agent handoff

## Current state

The main header now has a GitHub SVG icon linking to `https://github.com/luca-saggese/ascii_gpu_studio` in a new tab with `noopener noreferrer`, an accessible label, and visible keyboard focus. It remains visible on mobile. Lint, all 16 unit tests, production build, changed-code formatting, and a focused Chromium test covering link attributes, keyboard access, and 320-1440 px layouts pass. This change does not extend the browser matrix or alter the renderer/media path.

Vue 3/Vite local-first Studio with a raw WebGL2 ASCII renderer. The Studio imports local raster images and browser-supported video; `HTMLVideoElement` supplies both video clock and original audio. `.ascii` projects are versioned ZIP files, extracted with streaming size/path/count checks. `packages/vue` contains the in-repository Vue player and a runnable Vite example.

The single export menu and gzip JSON ASCII document are implemented. It includes deterministic 100 ms video seeking, optional source-audio capture, worker-rendered PNG, a self-contained offline HTML player, and deterministic H.264/AAC MP4 encoding/muxing through Mediabunny. MP4 from a loaded source video demuxes audio directly from the original file; imported `.ascii` projects use embedded audio. The current shared-layout branch passes lint, 16 unit tests, build, format check, and all 17 Chromium E2E tests. Browser coverage includes horizontal, vertical, square, resize, vector/bitmap parity, PNG/ASCII/HTML dimensions, HTML fullscreen contain behavior, MP4 audio, and silent MP4. Safari has not yet been tested in the browser matrix. Edge Detection and Flatten Colors are integrated into capture/export. Optional vector glyph rendering parses bundled OFL 1.1 WOFF font outlines; Canvas `Path2D` even-odd fills preserve counters without glyph atlases. Vector paths are cached and stored once per used character in `.ascii`; preview, PNG, and offline HTML use the same geometry. Bitmap is still the default. The browser suite also simulates an unavailable WebGL2 context and verifies bitmap Canvas 2D fallback. `.ascii` export proceeds without audio when capture is unsupported/fails, and the fallback is announced. The cumulative 20-million-cell cap was removed; video duration and memory/document-byte constraints remain.

The Studio also has **Save defaults**: it persists the full validated scene in browser localStorage; startup and Reset settings apply the saved values. The E2E checks saving, resetting, and reload persistence.

Bitmap preview prefers WebGL2. If browser policy, hardware, or configuration prevents context creation, it falls back to Canvas 2D using the same ASCII page renderer as exports and identifies the active backend in the preview badge. Canvas conversion is CPU-side and can be slower, especially for video/high column counts. Vector mode already uses Canvas 2D. WebGL shader/program failures are not masked by the fallback.

Video `.ascii` export's 40% phase is real-time audio capture; after it completes, frames are deterministically sought and converted at 100 ms intervals. The CPU export path now precomputes edge-filter luminance/blur instead of recalculating each neighborhood repeatedly and avoids temporary neighbor arrays in the bilateral filter. Longer clips, many frames, high columns, or active filters can still take time and consume memory; no sampling or cell-count cap has been reintroduced.

Flatten Colors uses bilateral smoothing and an OKLab nearest-color palette without dithering. Images derive a palette from the source; videos sample six distributed timestamps once and reuse the palette for all frames. WebGL preview uses a shared palette texture; ASCII capture stores final palette-only cell RGB and `.ascii` carries the palette/settings metadata. Combined edge detection always samples original luminance while using flattened colors as its image base.

Appearance has a dedicated strict B/W mode in addition to monochrome and source RGB. It maps luminance across the full charset so the output retains varied glyphs, fixes ink/background to white/black, and thresholds the rendered mask to binary pixels with no per-cell RGB field. The WebGL shader must use `getAppearanceColors()` for its foreground/background uniforms; reading the scene's custom colors directly bypasses B/W's fixed palette.

The ASCII text preview is a visible selectable/copyable `<pre>` whose glyph indices are read from the same WebGL shader pass as the GPU preview. It fits using the shared cell width/height, font size, and measured advance; text updates remain throttled to 8 fps for video. Bitmap PNG is rasterized on the main document thread after loading the selected bundled font, avoiding worker font fallback and keeping the export font aligned with the preview. Chromium E2E verifies glyph variety, B/W pixels, text layout, and shared bitmap/vector/PNG dimensions.

Control values/defaults: font size 4–16 px (8), line height 0.8–1.5 (1), contrast 0.4–1 (0.4), Edge Detection threshold 0–100 (1), smoothing 0–3 (0/Off). Edge threshold represents a percentage of normalized Sobel magnitude in both GPU shader and CPU capture. Persisted settings are normalized to the supported ranges before validation.

`tools/play_ascii.py` is a standard-library Python 3 player for gzip JSON `.ascii` documents. It centers/crops frames to the terminal, schedules by document timestamps and drops late frames to avoid cumulative delay; `--fps` caps redraws. Embedded audio plays through external FFplay, with an acknowledged small startup/device latency limitation. Run its unit tests with `python3 -m unittest discover -s tools -p 'test_*.py'`.

The inspector is viewport-bounded, scrolls independently from the page, and keeps its header/footer outside the scroll area. All five settings groups use native collapsible details/summary; edge mode is a select menu.

The fixed 20-million-cumulative-cell export limit was removed from both video capture and `.ascii` validation. A video is still capped at 30 minutes; complete frame data is held in memory, so actual exports remain bounded by available browser memory and the gzip document byte caps.

## First files to read

1. `docs/STATUS.md`, `docs/TODO.md`, `docs/ARCHITECTURE.md`, `docs/FILE_FORMAT.md`
2. `src/renderer.js`, `src/App.vue`, `src/format.js`, `packages/vue/src/AsciiPlayer.vue`
3. Latest Git commits and `tests/e2e/studio.spec.js`

## Commands

```sh
pnpm install
pnpm dev
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## Decisions and constraints

- Node 24.20.0, pnpm 11.24.0, JavaScript ESM only.
- Bitmap mode prefers a single WebGL fragment pass and falls back to Canvas 2D when WebGL2 context creation is unavailable; vector mode fills parsed font paths in Canvas 2D and does not render through a glyph atlas.
- IBM Plex Mono and Cousine are the selectable monospaced families; Lora remains bundled for compatibility with existing vector documents. Their notices are copied into `public/licenses/`. Older saved font aliases are mapped to a bundled monospace family so new renderer output stays cell-aligned.
- Source audio is native video playback only; never audio-reactive.
- ZIP v1 limits: 32 entries, 110 MiB compressed, 200 MiB expanded; media source cap 100 MiB.
- No third-party fonts or remote Google Fonts. The synthetic video fixture is project-generated VP8/Opus.
- The terminal player needs no Python packages; FFplay from an FFmpeg installation is required for embedded audio.

## Current gaps

No WebGL context restoration, audio acoustic assertion, Safari E2E, temporal hysteresis, custom charset editor, undo/redo, TXT/SVG, WebM exporter, or release CI. MP4 uses browser-provided WebCodecs H.264/AAC encoders, so unsupported hardware/configurations still fail explicitly. `.ascii` audio extraction still depends on browser MediaRecorder support; direct-source MP4 audio demux does not. Canvas2D fallback and vector preview are CPU-side and may be slower at large grids. Fontsource currently supplies Latin subsets; characters outside a selected font's subset use that font's missing-glyph outline. Flatten preview and capture use matching OKLab palettes and bilateral strength, but operate at GPU cell sampling versus 2× CPU capture resolution; small antialias/edge differences can remain. Vue package currently references shared source outside its package root and is not independently publishable.

## Resume

Do not claim Safari MP4 support as verified until tested on Safari hardware. Do not describe M6 as complete until outstanding security, cross-browser, accessibility, and release checks are evidenced.
