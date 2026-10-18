# TODO — execution backlog

Each status reflects the tested user-facing path, not code presence alone. Estimates are coarse.

## Completed

- [x] Keep terminal playback on a black background across every row and centered margins, independently of terminal/document background; preserve glyph colors, final color/cursor restoration and `--no-color`. Verified with 10 terminal unit tests, including the row-reset regression and Ctrl+C cleanup.
- [x] Correct Monochrome to use one solid neutral-gray tone per glyph on black (not binary B/W or an intra-glyph gradient), shared by WebGL, CPU/vector, selectable text and stored/exported cell colors; retain legacy mono foregrounds without cell colors. Verified with lint, 26 JS unit tests, 7 terminal tests, build, 9 focused Chromium and 3 focused WebKit checks.
- [x] Fix ASCII/HTML source-audio extraction without `captureStream` or MediaRecorder: locally remux original compressed audio into audio-only WebM/MP4 without re-encoding or real-time playback. Unit tests verify unchanged packets/timestamps, delayed starts, silent files, errors and cancellation; focused Chromium/WebKit checks verify exported audio playback with capture/codec APIs disabled.
- [x] Add an accessible GitHub repository icon/link to the main header, visible on desktop and mobile; verified with a focused Chromium keyboard/link/layout test.
- [x] AGPU-001 [P0] Bootstrap Vue/Vite JavaScript project — M0; `9c9633c`.
- [x] AGPU-010 [P0] Import local images and render glyph atlas with WebGL2 — M1; E2E verifies complete, distinct glyph masks; `9c9633c`, `e835d84`.
- [x] AGPU-011 [P0] Wire charset, font family/size, columns, fit, color, contrast, brightness, invert — M2 baseline; E2E changes columns; `9c9633c`, `e835d84`.
- [x] AGPU-013 [P0] Add plain-text ASCII preview beside WebGL view and report actual framebuffer resolution — E2E compares text rows, distinct GPU glyph masks and aspect ratio; text-mode video refresh capped at 8 fps.
- [x] AGPU-020 [P0] Play, pause, seek, loop, mute, and volume native video with source audio — M3 baseline; synthetic VP8/Opus decode and controls verified in Chromium; `9c9633c`, `c229bda`.
- [x] AGPU-030 [P0] Export/import versioned gzip-JSON `.ascii` conversion results; retain legacy ZIP import — unit and browser round-trip tests.
- [x] AGPU-031 [P0] Export PNG by rendering ASCII pages at configured cell resolution — browser verifies dimensions and parity with offline HTML render.
- [x] AGPU-032 [P0] Vue `AsciiPlayer` wrapper and runnable example — M5; browser loads a generated `.ascii` and renders it; `9c9633c`.
- [x] AGPU-040 [P0] Reject ZIP traversal and drive-absolute paths during bounded streaming extraction — unit/E2E cover path rejection; `06410a5`.
- [x] AGPU-014 [P1] Expose typography controls and improve raster detail — logical font-size/line-height controls, integer cell metrics, and 4×–8× GPU-aware atlas rasterization; covered by Chromium E2E.
- [x] AGPU-056 [P1] Add shared gzip-JSON ASCII result format, deterministic frame sampling, optional audio capture, PNG export, standalone offline HTML player, and accessible export dropdown; browser coverage includes image color and video with/without audio.
- [x] AGPU-058 [P1] Add fixed-scale Sobel Edge Detection with configurable smoothing, threshold, solo-edge/image blend modes, live WebGL preview, 2× grid ASCII conversion, and `.ascii` filter metadata; lint, unit, build, format, and Chromium E2E pass.
- [x] AGPU-059 [P1] Save and persist the current full parameter set as browser defaults; startup and Reset settings restore it, covered by Chromium reload/reset E2E.
- [x] AGPU-060 [P1] Add Flatten Colors with bilateral smoothing, 2–64-color OKLab palette reduction, one fixed global palette sampled across six video timestamps, live GPU quantization, palette-only RGB cell colors, and `.ascii` metadata; unit and Chromium image/video E2E cover output.
- [x] AGPU-061 [P1] Constrain settings to an independently scrolling inspector, make all five groups collapsible, and select Edge Detection mode from explicit options; verified with responsive Chromium E2E.
- [x] AGPU-062 [P1] Remove the cumulative 20-million-cell export/validation cap and verify `.ascii` validation above the former threshold.
- [x] AGPU-063 [P1] Add opt-in OpenType vector glyph rendering, bundled OFL fonts, deduplicated per-character paths in `.ascii`, and shared preview/PNG/offline-HTML path filling; verify counters, accents, punctuation, and vector export in Chromium.
- [x] AGPU-064 [P1] Preserve bitmap preview when WebGL2 context creation is unavailable using a Canvas 2D fallback, expose the actual backend, and verify the fallback in Chromium.
- [x] AGPU-065 [P1] Reduce CPU cost in deterministic video ASCII capture by precomputing Sobel luminance/blur and removing bilateral-filter neighbor allocations; verify output against the reference edge calculation.
- [x] AGPU-066 [P1] Add a strict black-and-white appearance mode with full-charset density mapping, binary glyph masks, black/white-only output, and mode metadata; verify WebGL, vector, and export output in Chromium.
- [x] AGPU-067 [P1] Add a Python terminal player for gzip-JSON `.ascii` video with centered cropping, timestamp-driven adaptive frame pacing, optional FPS cap, and embedded FFplay audio; cover decoding, crop, and RGB output with unit tests.
- [x] AGPU-066 [P1] Unify source-aware logical dimensions and integer font-cell metrics across bitmap/vector preview, PNG, MP4, `.ascii`, and offline HTML; preserve contain behavior and verify horizontal, vertical, and square media.
- [x] AGPU-068 [P1] Use WebGL-selected glyph indices for selectable ASCII text and bitmap PNG export; align the text preview to shared font-cell metrics and verify B/W and cross-renderer dimensions in Chromium.
- [x] AGPU-069 [P1] Set requested font size, line height, contrast, and Edge Detection ranges/defaults; apply threshold percentage consistently in shader/CPU paths and normalize persisted settings.

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
- [x] AGPU-057 [P1] Add capability-checked deterministic H.264/AAC WebCodecs encoding and verified MP4 muxing; source video audio is demuxed directly from the original file, while imported `.ascii` uses embedded audio. Chromium E2E verifies playable MP4 with audio and silent video. Safari runtime validation remains in the cross-browser backlog.

## Blocked

- None. P0 hardening and support breadth remain incomplete but do not prevent further local development.
