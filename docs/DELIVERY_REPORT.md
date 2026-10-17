# Delivery report — ASCII GPU Studio

## Repository / branch / commits

- Repository: `luca-saggese/ascii_gpu_studio`
- Branch: `main`
- Implementation: `9c9633c` — `feat(studio): deliver WebGL ASCII workspace and Vue player`
- Verification: `c229bda` — `test(video): verify decoded source audio during playback`
- Hardening: `06410a5` — `fix(format): reject drive-absolute asset paths`
- Renderer correction: `e835d84` — `fix(renderer): sample complete glyphs with measured cell metrics`
- Working tree: implementation and verification committed; the supplied specification file remains untracked and unchanged.

## Implemented and verified

- Vue 3/Vite Studio in JavaScript ESM, Node 24.20.0 / pnpm 11.24.0; no TypeScript.
- Responsive dark Studio with local image/video selection, drag-and-drop, loading/error states, fitted canvas and mobile controls view.
- Real WebGL2 glyph-atlas renderer; live columns, built-in charset, font family/size, monochrome/source color, fit, foreground/background, contrast, brightness and invert. Cell advance and height use measured font metrics; the shader selects a discrete glyph and samples the full glyph tile. Cell count is capped at 40,000, with no per-frame GPU readback.
- Glyph atlas uses a fixed 20 px internal font size and rasterizes at 4× device-pixel ratio up to 8×, bounded by the GPU maximum texture size. Font size is not user-adjustable; the Studio provides 32–320 grid columns for resolution control. Framebuffer dimensions keep the measured glyph-cell aspect ratio and are shown as GPU pixel dimensions in the status bar.
- Added a toggle between WebGL preview and a normal selectable/copyable plain-text ASCII grid, generated from the same source frame and scene adjustments. Video text previews refresh at up to 8 fps to limit CPU work.
- Corrected luminance-to-glyph mapping: dark image cells now select denser glyphs and bright cells lighter glyphs. A dedicated half-black/half-white browser regression verifies the output.
- A browser regression check confirms glyphs have horizontal mask variation and multiple distinct cell masks; this guards against sampling a single atlas column or blending adjacent characters.
- Local HTML video playback with original native audio, media-clock rendering, play/pause/seek/loop/mute/volume. The synthetic VP8/Opus fixture is played in Chromium and its audio decode counter is verified; acoustic output is not asserted.
- Version 1 `.ascii` ZIP export/import containing the original source, settings, manifest and rendered PNG thumbnail. Extraction checks paths, entry count, format version and a 200 MiB expansion cap while streaming entries.
- PNG export from the rendered WebGL canvas.
- In-repository Vue `AsciiPlayer` example loads a generated `.ascii` project and renders through the same WebGL engine.
- Automated Chromium screenshots: [empty state](./screenshots/empty-state.png), [image preview](./screenshots/image-preview.png), [video playback](./screenshots/video-playback.png).
- No media upload, remote fonts, analytics or copied renderer code.

## Commands and evidence

| Command             | Result                                                          |
| ------------------- | --------------------------------------------------------------- |
| `pnpm lint`         | PASS, no warnings                                               |
| `pnpm test`         | PASS, 5 unit tests                                              |
| `pnpm build`        | PASS; 116.15 kB JS (45.25 kB gzip), 13.16 kB CSS (3.81 kB gzip) |
| `pnpm format:check` | PASS                                                            |
| `pnpm test:e2e`     | PASS, 6 Chromium scenarios                                      |

E2E covers empty state and 1280×720 / 768×1024 / 390×844 widths, WebGL image render and control changes, tonal density mapping on a black/white fixture, plain-text preview, `.ascii` export/import round-trip, PNG signature and dimensions, ZIP traversal rejection, Vue runtime rendering, plus native video play/pause/seek/loop and Opus decode. Chromium was run headlessly on the local macOS environment; no Firefox/WebKit or hardware performance results are claimed.

## Milestones

- M0 bootstrap: implemented.
- M1 real WebGL2 image rendering: implemented and browser-tested.
- M2 appearance/typography controls: baseline built-in controls implemented; custom charset entry, coverage warning, undo/redo, richer presets and complete inspector are not.
- M3 video/audio: native playback controls and synchronized frame updates implemented; one generated Chromium fixture tested.
- M4 perceptual quality: incomplete. Current selection is luminance plus measured glyph coverage and 3×3 sampling; edge-aware selection and temporal hysteresis are not implemented.
- M5 `.ascii`, PNG and Vue runtime: implemented for the in-repository demo and browser-tested; external package installation is not yet supported.
- M6 release hardening: incomplete; see open items below.
- M7 enhancements: not implemented.

## Known limitations / remaining work

- WebGL2 is required; no Canvas fallback or tested context-loss restoration.
- Image input accepts PNG/JPEG/WebP/AVIF as supported by the browser; video input accepts MP4/WebM subject to installed codec support. EXIF orientation, magic-byte validation, unusual profiles and texture-limit recovery need additional hardening.
- ZIP input is capped at 110 MiB compressed, 200 MiB expanded and 32 entries; source files are capped at 100 MiB. Extracted entries are retained in memory, so large archives can still require substantial memory. The expansion-abort path needs a dedicated ZIP-bomb regression fixture.
- `.ascii` video projects preserve original media/audio bytes; playback is decoded locally. No rendered WebM export, audio muxing or frame-step.
- `@ascii-gpu/vue` is a private in-repository workspace source package referencing shared source outside its package root. It is not independently publishable/consumer-installable.
- No edge-aware/perceptual matching, temporal stability, custom charset input, user font loading, preset collection, undo/redo, TXT/SVG export, React or Web Component wrapper.
- No CI workflow, Firefox/WebKit matrix, screen-reader/contrast audit, memory leak run, or measured FPS/performance matrix.

## Security and licensing

All source media processing is local. The `.ascii` parser bounds extracted data while processing and rejects path traversal. No third-party renderer source, fonts, or image/video assets were copied into the project. `fflate`, Vue, Vite and test dependencies are pinned by `pnpm-lock.yaml`; their individual license metadata still needs a release-time audit. The project includes an MIT license, but this is not a complete external security audit or release approval.

## Run

```sh
pnpm install
pnpm dev
```

Open the Studio, import an image or supported video, and use **Export** for the editable `.ascii` project or **Export PNG** for the rendered preview. Install Chromium once with `pnpm exec playwright install chromium` before running `pnpm test:e2e`.

Vue sample usage is in [`examples/vue/App.vue`](../examples/vue/App.vue); the component contract is documented in [`API.md`](./API.md). This sample is a repository example, not an npm-ready standalone release.
