# Agent handoff

## Current state

Vue 3/Vite local-first Studio with a raw WebGL2 ASCII renderer. The Studio imports local raster images and browser-supported video; `HTMLVideoElement` supplies both video clock and original audio. `.ascii` projects are versioned ZIP files, extracted with streaming size/path/count checks. `packages/vue` contains the in-repository Vue player and a runnable Vite example.

The single export menu and gzip JSON ASCII document are implemented. It includes deterministic 100 ms video seeking, optional source-audio capture, worker-rendered PNG, and a self-contained offline HTML player. The MP4 option reports unsupported in this Chromium rather than using real-time recording. Edge Detection and Flatten Colors are integrated into capture/export. Optional vector glyph rendering parses bundled OFL 1.1 WOFF font outlines; Canvas `Path2D` even-odd fills preserve counters without glyph atlases. Vector paths are cached and stored once per used character in `.ascii`; preview, PNG, and offline HTML use the same geometry. Bitmap is still the default. Latest verification: `pnpm lint`, `pnpm test` (14), `pnpm build`, `pnpm format:check`, and `pnpm test:e2e` (14 Chromium tests) all pass. Video ASCII output proceeds without audio when capture is unsupported/fails, and the fallback is announced. The cumulative 20-million-cell cap was removed; video duration and memory/document-byte constraints remain.

The Studio also has **Save defaults**: it persists the full validated scene in browser localStorage; startup and Reset settings apply the saved values. The E2E checks saving, resetting, and reload persistence.

Flatten Colors uses bilateral smoothing and an OKLab nearest-color palette without dithering. Images derive a palette from the source; videos sample six distributed timestamps once and reuse the palette for all frames. WebGL preview uses a shared palette texture; ASCII capture stores final palette-only cell RGB and `.ascii` carries the palette/settings metadata. Combined edge detection always samples original luminance while using flattened colors as its image base.

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
- Bitmap mode uses a single WebGL fragment pass; vector mode fills parsed font paths in Canvas 2D and does not render through a glyph atlas.
- IBM Plex Mono, Cousine, and Lora are bundled under SIL OFL 1.1. Their notices are copied into `public/licenses/`. Older saved system font aliases are mapped to a bundled family so renderer selection is consistent.
- Source audio is native video playback only; never audio-reactive.
- ZIP v1 limits: 32 entries, 110 MiB compressed, 200 MiB expanded; media source cap 100 MiB.
- No third-party fonts or remote Google Fonts. The synthetic video fixture is project-generated VP8/Opus.

## Current gaps

No WebGL context restoration/fallback, audio acoustic assertion, other-browser E2E, temporal hysteresis, custom charset editor, undo/redo, TXT/SVG, WebM exporter, deterministic MP4, or release CI. Vector preview is CPU-side Canvas 2D and may be slower at large grids. Fontsource currently supplies Latin subsets; characters outside a selected font's subset use that font's missing-glyph outline. Flatten preview and capture use matching OKLab palettes and bilateral strength, but operate at GPU cell sampling versus 2× CPU capture resolution; small antialias/edge differences can remain. Vue package currently references shared source outside its package root and is not independently publishable.

## Resume

Do not describe MP4 generation as implemented: this environment lacks WebCodecs and no MP4 muxer is bundled. Do not describe M6 as complete until outstanding security, cross-browser, accessibility, and release checks are evidenced.
