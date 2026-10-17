# Agent handoff

## Current state

Vue 3/Vite local-first Studio with a raw WebGL2 ASCII renderer. The Studio imports local raster images and browser-supported video; `HTMLVideoElement` supplies both video clock and original audio. `.ascii` projects are versioned ZIP files, extracted with streaming size/path/count checks. `packages/vue` contains the in-repository Vue player and a runnable Vite example.

The single export menu and gzip JSON ASCII document are implemented. It includes deterministic 100 ms video seeking, optional source-audio capture, worker-rendered PNG, and a self-contained offline HTML player. The MP4 option reports unsupported in this Chromium rather than using real-time recording. Latest lint, unit tests, build, and format checks pass. The complete E2E run has one reproducible failure: after importing the exported `.ascii` image document, the PNG export never dispatches a download (60-second focused timeout).

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
- Single fragment pass; no readback during normal rendering. Glyph coverage measured via 2D canvas when atlas is generated.
- Source audio is native video playback only; never audio-reactive.
- ZIP v1 limits: 32 entries, 110 MiB compressed, 200 MiB expanded; media source cap 100 MiB.
- No third-party fonts or remote Google Fonts. The synthetic video fixture is project-generated VP8/Opus.

## Current gaps

No WebGL context restoration/fallback, audio acoustic assertion, other-browser E2E, edge-aware algorithm, custom charset editor, undo/redo, TXT/SVG, WebM exporter, or release CI. Vue package currently references shared source outside its package root and is not independently publishable.

## Resume

Do not describe MP4 generation as implemented: this environment lacks WebCodecs and no MP4 muxer is bundled. Diagnose and fix the PNG worker/export hang after `.ascii` import before claiming the export workflow passes. Do not describe M6 as complete until the E2E issue and outstanding security, cross-browser, accessibility, and release checks are evidenced.
