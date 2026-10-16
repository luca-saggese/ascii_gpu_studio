# Agent handoff

## Current state

Vue 3/Vite local-first Studio with a raw WebGL2 ASCII renderer. The Studio imports local raster images and browser-supported video; `HTMLVideoElement` supplies both video clock and original audio. `.ascii` projects are versioned ZIP files, extracted with streaming size/path/count checks. `packages/vue` contains the in-repository Vue player and a runnable Vite example.

Latest verified implementation commit: `e835d84`; the current uncommitted renderer fix adds a plain-text ASCII preview, higher-resolution glyph atlas sampling, aspect-correct framebuffer sizing, and correct dark-to-dense glyph mapping. Checks on the working tree: lint, 5 unit tests, production build, format check, and all 6 Chromium E2E scenarios pass. The new half-black/half-white regression confirms darker cells render with denser glyphs.

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

The latest renderer and text-preview changes have passed the full local check set. Do not describe M6 as complete until the outstanding security, cross-browser, accessibility, and release checks are evidenced.
