# Execution status

Current milestone: M6 — release hardening, **partial implementation; not release-ready**

Latest verified implementation commit: `e835d84` (`fix(renderer): sample complete glyphs with measured cell metrics`); subsequent renderer/text-preview fixes are verified in the working tree and awaiting commit.

Additional checkpoints: `9c9633c` (Studio/runtime implementation), `c229bda` (video audio decode E2E), `06410a5` (archive path hardening)

Latest verification: `pnpm lint`, `pnpm test` (10 tests), `pnpm build`, `pnpm format:check`, and `pnpm test:e2e` (8 tests) all pass. The PNG worker issue after importing a gzip `.ascii` document was fixed by posting plain data rather than Vue reactive proxies.

## Works now

- Responsive Vue 3/Vite Studio with empty state, local image/video import, error handling, and no media upload.
- Real WebGL2 fragment shader with measured glyph atlas, adjustable columns/charset/color/fit/brightness/contrast/invert controls, and PNG capture. Font size is fixed internally rather than exposed as a separate setting.
- Toggle between WebGL output and normal monospace ASCII text; Studio grid supports 32–320 columns. Glyph atlas rasterization uses 4× device-pixel ratio up to 8×, bounded by the GPU texture limit. Framebuffer preserves cell aspect ratio and reports actual WebGL pixel dimensions.
- Corrected tonal mapping so dark pixels select denser glyphs and bright pixels select lighter glyphs; a black/white split-image browser regression verifies the behavior.
- Edge Detection is live in WebGL2 and configurable with enable, 0–255 threshold, optional Gaussian smoothing, Solo bordi/Bordi + immagine modes, and edge intensity. Sobel magnitudes use a fixed scale; ASCII capture processes at 2× grid resolution to retain thin contours. `.ascii` records filter settings and already-converted pages; PNG and HTML consume those pages unchanged.
- Native HTML video audio and media clock, `requestVideoFrameCallback` rendering/fallback, user-triggered play/pause/seek/loop/mute/volume.
- New `.ascii` v1 gzip-JSON result export/import; stores text pages, render/font/color parameters, timestamps/durations, optional WebM audio, and compact per-cell RGB. Legacy ZIP projects remain importable.
- A single keyboard-accessible Export dropdown offers ASCII, contextual PNG/MP4, and standalone offline HTML. It supports Escape/outside click and reports cancellable progress for video conversion.
- PNG rasterizes the ASCII document at configured cell resolution in an OffscreenCanvas worker when available; the same drawing function is embedded in the offline HTML player.
- Offline HTML includes the gzip payload, renderer, custom controls, seeking and audio; no network assets are requested.
- Vue `AsciiPlayer` example loads a real package and renders it.
- MP4 is intentionally not emitted in this environment: Chromium reports MediaRecorder MP4 support but has no WebCodecs, and a verified MP4 muxer is not bundled. The UI reports this accurately instead of making a nondeterministic real-time recording.
- Chromium E2E covers live Sobel preview and settings metadata, image RGB ASCII/PNG/HTML parity, video frame timings with and without audio, HTML audio playback/seek offline, MP4 capability errors, menu behavior, legacy ZIP traversal rejection, Vue runtime, and native playback controls.

## Does not work / not claimed

- Temporal hysteresis, custom charset text entry, editing/history/undo, presets, custom font uploads, TXT/SVG export.
- Deterministic MP4 export awaits WebCodecs plus a verified muxer. HTML player fonts use the installed local monospace family rather than embedding a font file.
- Exported video audio is captured to WebM/Opus via `captureStream` and MediaRecorder; browser support varies, and unsupported capture/codec paths return explicit errors. Native Studio playback continues using the original video audio track.
- React/Web Component packages, external Vue consumer install/publish, Canvas2D fallback, WebGL context restoration.
- CI/browser matrix, screen-reader audit, quantitative performance/memory benchmarks, and hand-reviewed screenshots on other operating systems.
- `.ascii` hard limits prevent oversized extraction, but the implementation still holds extracted file bytes in memory; archives are local, not streamed from remote storage.
- Expanded-size enforcement is implemented during decompression, but there is not yet a dedicated ZIP-bomb regression fixture that drives the 200 MiB cap.

## Known limits

- WebGL2 is required; unavailable contexts show an error and do not fall back.
- Browser codec support/autoplay policy governs video. Source file cap 100 MiB; legacy ZIP imports cap 110 MiB compressed, 200 MiB expanded, 32 entries. New `.ascii` gzip JSON export is not source-size bounded after compression.
- `@ascii-gpu/vue` is currently a local workspace source package, not yet a standalone publishable package.
- The image preview stores the original media but handles EXIF/magic-byte validation and unusual color profiles are not yet hardened.

## Next three actions

1. Add a ZIP expansion-limit regression fixture and WebGL context loss/restore coverage.
2. Make the Vue SDK package self-contained and verify an external consumer installation.
3. Add CI and Firefox/WebKit E2E before claiming release readiness.
