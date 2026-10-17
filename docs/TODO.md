# TODO — execution backlog

Each status reflects the tested user-facing path, not code presence alone. Estimates are coarse.

## Completed

- [x] AGPU-001 [P0] Bootstrap Vue/Vite JavaScript project — M0; `9c9633c`.
- [x] AGPU-010 [P0] Import local images and render glyph atlas with WebGL2 — M1; E2E verifies complete, distinct glyph masks; `9c9633c`, `e835d84`.
- [x] AGPU-011 [P0] Wire charset, font family/size, columns, fit, color, contrast, brightness, invert — M2 baseline; E2E changes columns; `9c9633c`, `e835d84`.
- [x] AGPU-013 [P0] Add plain-text ASCII preview beside WebGL view and report actual framebuffer resolution — E2E compares text rows, distinct GPU glyph masks and aspect ratio; text-mode video refresh capped at 8 fps.
- [x] AGPU-020 [P0] Play, pause, seek, loop, mute, and volume native video with source audio — M3 baseline; synthetic VP8/Opus decode and controls verified in Chromium; `9c9633c`, `c229bda`.
- [x] AGPU-030 [P0] Export/import versioned gzip-JSON `.ascii` conversion results; retain legacy ZIP import — unit and browser round-trip tests.
- [x] AGPU-031 [P0] Export PNG by rendering ASCII pages at configured cell resolution — browser verifies dimensions and parity with offline HTML render.
- [x] AGPU-032 [P0] Vue `AsciiPlayer` wrapper and runnable example — M5; browser loads a generated `.ascii` and renders it; `9c9633c`.
- [x] AGPU-040 [P0] Reject ZIP traversal and drive-absolute paths during bounded streaming extraction — unit/E2E cover path rejection; `06410a5`.
- [x] AGPU-014 [P1] Remove user font-size control and improve raster detail — fixed internal 20 px glyph size, 4×–8× GPU-aware atlas scale, and 32–320 column control; covered by Chromium E2E.
- [x] AGPU-056 [P1] Add shared gzip-JSON ASCII result format, deterministic frame sampling, optional audio capture, PNG export, standalone offline HTML player, and accessible export dropdown; browser coverage includes image color and video with/without audio.
- [x] AGPU-058 [P1] Add fixed-scale Sobel Edge Detection with configurable smoothing, threshold, solo-edge/image blend modes, live WebGL preview, 2× grid ASCII conversion, and `.ascii` filter metadata; lint, unit, build, format, and Chromium E2E pass.
- [x] AGPU-059 [P1] Save and persist the current full parameter set as browser defaults; startup and Reset settings restore it, covered by Chromium reload/reset E2E.
- [x] AGPU-060 [P1] Add Flatten Colors with bilateral smoothing, 2–64-color OKLab palette reduction, one fixed global palette sampled across six video timestamps, live GPU quantization, palette-only RGB cell colors, and `.ascii` metadata; unit and Chromium image/video E2E cover output.
- [x] AGPU-061 [P1] Constrain settings to an independently scrolling inspector, make all five groups collapsible, and select Edge Detection mode from explicit options; verified with responsive Chromium E2E.
- [x] AGPU-062 [P1] Remove the cumulative 20-million-cell export/validation cap and verify `.ascii` validation above the former threshold.
- [x] AGPU-063 [P1] Add opt-in OpenType vector glyph rendering, bundled OFL fonts, deduplicated per-character paths in `.ascii`, and shared preview/PNG/offline-HTML path filling; verify counters, accents, punctuation, and vector export in Chromium.

## In progress

- [ ] AGPU-050 [P0] Release hardening and delivery evidence — M6; complete the multi-browser matrix and review E2E screenshots.
- [ ] AGPU-041 [P0] Add a dedicated ZIP expanded-limit regression fixture; streaming limit implemented but the 200 MiB abort path is not independently exercised.

## Backlog

- [ ] AGPU-012 [P0] Validate image magic bytes, EXIF orientation, alpha handling, and browser texture limits.
- [ ] AGPU-021 [P0] Verify native audio output across browser policies/devices and include a manual audio check.
- [ ] AGPU-033 [P0] Make Vue SDK self-contained/publishable and test consumer install from an external project.
- [ ] AGPU-042 [P0] Add tested WebGL context loss/restoration and a user-visible recovery path.
- [ ] AGPU-051 [P0] Add CI workflow, browser installation/cache, npm/license audit, and accessibility review.
- [ ] AGPU-052 [P1] Add temporal hysteresis, golden quality comparisons, and measured FPS benchmarks for edge-aware conversion.
- [ ] AGPU-053 [P1] Add custom charset entry, preset library, undo/redo, custom font handling, TXT/SVG export.
- [ ] AGPU-054 [P1] Add React and Web Component wrappers.
- [ ] AGPU-055 [P2] Evaluate adaptive quality, GIF animation, webcam, and WebM recording with verified audio.
- [ ] AGPU-057 [P1] Add deterministic WebCodecs video/audio encoding and a verified MP4 muxer; current Chromium has neither WebCodecs nor a bundled muxer, so MP4 export fails explicitly instead of emitting an invalid file.

## Blocked

- None. P0 hardening and support breadth remain incomplete but do not prevent further local development.
