# Execution status

Current milestone: M6 — release hardening, **partial implementation; not release-ready**

Latest committed implementation: `240ddb2` (`fix(export): mux source video audio into MP4`). Shared logical-layout work is in the current working tree.

Additional checkpoints: `9c9633c` (Studio/runtime implementation), `c229bda` (video audio decode E2E), `06410a5` (archive path hardening)

Latest verification for preview/export parity: `pnpm lint`, `pnpm test` (16 tests), `pnpm build`, and focused Chromium tests for B/W output and shared bitmap/vector/PNG/HTML dimensions pass. ASCII text reads the same glyph indices selected by the WebGL shader, remains selectable/copyable as text, and uses the shared cell/font metrics. Bitmap PNG export uses the loaded document fonts so it matches the text and WebGL glyphs. Safari is not included in the browser matrix.

Typography and appearance controls now use font size 4–16 (default 8), line height 0.8–1.5 (default 1), and contrast 0.4–1 (default 0.4). Edge Detection threshold is 0–100 (default 1), and smoothing defaults to Off (0).

## Works now

- Monochrome now assigns one solid grayscale ink to each glyph from adjusted cell luminance, on a black background; contour antialiasing is not a source-image gradient. WebGL, Canvas fallback, vector, selectable text, stored `.ascii` colors and shared PNG/MP4/HTML rendering use these tones. Legacy mono documents without cell colors retain their foreground/background. Binary B/W and source RGB remain distinct. Lint, 26 JS unit tests, 7 terminal tests, build, 9 focused Chromium and 3 focused WebKit checks pass.
- ASCII/HTML audio extraction reads the original local file with Mediabunny and copies compressed audio packets into an audio-only WebM or MP4, without `captureStream`, MediaRecorder, WebCodecs, real-time playback, or re-encoding. Original timestamps and source mute/volume state are preserved. Verified with lint, 22 unit tests, build, four focused Chromium video/export tests (including AAC), and two focused WebKit audio/silent-export tests. WebKit automation is not a complete Safari/device matrix or an acoustic audio-output assertion.
- The main header includes an accessible GitHub icon linking to the repository in a new tab, visible on desktop and mobile. Lint, 16 unit tests, production build, formatting, and a focused Chromium keyboard/link/layout check (320-1440 px) pass.
- Responsive Vue 3/Vite Studio with empty state, local image/video import, error handling, and no media upload.
- Real WebGL2 fragment shader with measured glyph atlas, adjustable font size, line height, charset/color/brightness/contrast/invert controls, and PNG capture.
- If WebGL2 context creation is unavailable, the bitmap preview falls back to Canvas 2D and reports the active backend; vector preview continues through its existing Canvas 2D path. WebGL2 remains the preferred renderer.
- One shared source layout measures integer font cells, fits complete rows/columns into 1024×576 while preserving source aspect, and drives WebGL, vector, fallback, ASCII capture, PNG, MP4, and HTML. Resize changes only display scale; logical dimensions and exports remain fixed. MP4 adds even-dimension padding only on the right/bottom.
- Toggle between WebGL output and a selectable, copyable ASCII `<pre>` using glyph indices captured from the same WebGL shader. The preview uses the shared integer cell/font metrics and contain sizing. Glyph atlas rasterization uses 4× device-pixel ratio up to 8×, bounded by the GPU texture limit; DPR affects only preview buffer resolution.
- Corrected tonal mapping so dark pixels select denser glyphs and bright pixels select lighter glyphs; a black/white split-image browser regression verifies the behavior.
- Added a separate Black & white appearance mode: the full charset still maps luminance to glyph density, while the rendered masks are hard-thresholded to black/white and use white ink on black.
- Edge Detection is live in WebGL2 and configurable with enable, 0–255 threshold, optional Gaussian smoothing, Solo bordi/Bordi + immagine modes, and edge intensity. Sobel magnitudes use a fixed scale; ASCII capture processes at 2× grid resolution to retain thin contours. `.ascii` records filter settings and already-converted pages; PNG and HTML consume those pages unchanged.
- Flatten Colors uses OKLab nearest-palette assignment without dithering and a bilateral smoother with its own independent strength control. Image palettes are source-based; video palettes come from six evenly spaced frames and remain fixed across playback/export. The WebGL preview and ASCII capture use the same palette; RGB cell colors and `.ascii` metadata preserve it. Combined Edge Detection computes gradients from the original source and uses flattened colors for the image base.
- Save defaults persists the validated full Studio scene in localStorage; startup and Reset settings restore the saved values, with storage/validation errors surfaced in the UI.
- Settings live in a fixed-height inspector with its own scroll region. Source, Typography, Appearance, Edge Detection, and Flatten Colors groups are collapsible; Edge Detection mode uses a select with Solo bordi and Bordi + immagine options.
- Native HTML video audio and media clock, `requestVideoFrameCallback` rendering/fallback, user-triggered play/pause/seek/loop/mute/volume.
- New `.ascii` v1 gzip-JSON result export/import; stores text pages, render/font/color parameters, timestamps/durations, optional WebM/MP4 audio, and compact per-cell RGB. Legacy ZIP projects remain importable.
- Video export no longer applies a cumulative 20-million-cell ceiling. The existing 30-minute duration cap and browser memory/`.ascii` size constraints still apply.
- If audio capture is unavailable or fails, video ASCII frame export continues without audio and notifies the user; cancellation still aborts the export.
- CPU export filtering avoids repeated Sobel neighborhood calculations and per-neighbor allocation in bilateral smoothing; unit tests compare optimized edge output to the reference magnitude.
- A single keyboard-accessible Export dropdown offers ASCII, contextual PNG/MP4, and standalone offline HTML. It supports Escape/outside click and reports cancellable progress for video conversion.
- PNG rasterizes the ASCII document at configured cell resolution in an OffscreenCanvas worker when available; the same drawing function is embedded in the offline HTML player.
- Optional vector glyph rendering uses parsed OpenType outlines and even-odd `Path2D` fills, cached by font/weight/glyph/precision. Bitmap remains the default. IBM Plex Mono and Cousine are the selectable monospaced families; bundled Lora assets remain available for existing vector documents. The vector `.ascii` mode stores deduplicated outline geometry only for glyphs present in captured pages plus font license attribution; PNG and offline HTML use those same paths without a font or raster atlas.
- Vector preview uses Canvas 2D path rasterization rather than WebGL; large grids and video can therefore be slower than bitmap preview.
- Offline HTML includes the gzip payload, renderer, custom controls, seeking and audio; no network assets are requested.
- Vue `AsciiPlayer` example loads a real package and renders it.
- `tools/play_ascii.py` plays `.ascii` videos in the terminal, centers/crops frames to terminal dimensions, follows source timestamps while dropping late frames, supports an optional FPS ceiling, and plays embedded audio through FFplay. The standalone script requires Python 3; audio playback requires FFplay.
- MP4 export uses Mediabunny to mux deterministic ASCII-rendered H.264 frames and, when available, AAC audio into a real MP4. For source videos it demuxes audio directly from the original local file; imported `.ascii` documents use their embedded audio. Encoder support is checked at the selected dimensions; unsupported codecs report an explicit capability error instead of producing a mislabeled file.
- Chromium E2E covers the panel's bounded scrolling and collapsible groups, live Sobel preview and settings metadata, image RGB ASCII/PNG/HTML parity, video frame timings with and without audio, HTML audio playback/seek offline, playable H.264/AAC MP4 with audio and silent MP4, menu behavior, legacy ZIP traversal rejection, Vue runtime, and native playback controls.

## Does not work / not claimed

- The full Chromium suite is not claimed green: the Source color image round-trip test reports bitmap PNG/offline HTML pixel mismatch (the offline bitmap HTML has no bundled font), and the broad run was stopped during the expensive global-video-palette assertion loop. Focused grayscale/vector/offline and B/W checks pass; bitmap offline typography remains dependent on installed fonts.
- Temporal hysteresis, custom charset text entry, editing/history/undo, presets, custom font uploads, TXT/SVG export.
- Two focused WebKit checks cover source-audio extraction/playback and silent ASCII export; the full Safari/device/browser matrix is still incomplete. MP4 output requires native WebCodecs H.264 encoding and, for audio, AAC encoding; unsupported device/browser configurations return a specific error.
- `.ascii` audio extraction requires a container/codec recognized by Mediabunny that can be remuxed into WebM or MP4. Playback still requires browser support for that original codec. Extraction failures are explicitly reported while frame export continues without audio. MP4 from a source video demuxes the original file; imported `.ascii` MP4 uses its embedded audio.
- React/Web Component packages, external Vue consumer install/publish, WebGL context restoration.
- CI/browser matrix, screen-reader audit, quantitative performance/memory benchmarks, and hand-reviewed screenshots on other operating systems.
- `.ascii` hard limits prevent oversized extraction, but the implementation still holds extracted file bytes in memory; archives are local, not streamed from remote storage.
- Expanded-size enforcement is implemented during decompression, but there is not yet a dedicated ZIP-bomb regression fixture that drives the 200 MiB cap.

## Known limits

- Canvas 2D fallback preserves the preview when WebGL2 is unavailable, but CPU conversion can be slower, especially for video and high column counts. WebGL2 remains recommended for performance.
- Video ASCII export remuxes audio before deterministic 100 ms frame conversion; long clips can still take time and memory for frame seeking/conversion, but no longer require real-time audio recording.
- Browser codec support/autoplay policy governs video. Source file cap 100 MiB; legacy ZIP imports cap 110 MiB compressed, 200 MiB expanded, 32 entries. New `.ascii` gzip JSON export is not source-size bounded after compression.
- The terminal player uses a monotonic wall clock with the external FFplay process; audio device/startup latency can cause a small initial sync offset. Without FFplay, use `--no-audio`.
- `@ascii-gpu/vue` is currently a local workspace source package, not yet a standalone publishable package.
- The image preview stores the original media but handles EXIF/magic-byte validation and unusual color profiles are not yet hardened.

## Next three actions

1. Add a ZIP expansion-limit regression fixture and WebGL context loss/restore coverage.
2. Make the Vue SDK package self-contained and verify an external consumer installation.
3. Add CI and Firefox/WebKit E2E before claiming release readiness.
